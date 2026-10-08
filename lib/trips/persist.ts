import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Itinerary } from '../plan/itinerary.ts';
import type { Provenance } from '../providers/types.ts';

/**
 * Writing a generated itinerary to Supabase, and reading it back.
 *
 * All of this goes through the *user's* client, never the service role, so Row
 * Level Security is the thing enforcing ownership. A trip id arriving from the
 * browser is therefore safe to use directly: if it belongs to someone else the
 * database returns nothing, and no code here has to remember to check.
 */

/** The engine's provenance kinds map onto the database enum. */
function toColumn(p: Provenance): 'verified' | 'estimated' | 'unavailable' {
  if (p.kind === 'verified') return 'verified';
  if (p.kind === 'unavailable') return 'unavailable';
  return 'estimated';
}

const providerOf = (p: Provenance): string | null =>
  p.kind === 'verified' ? p.source : p.kind === 'unavailable' ? p.provider : null;

export type SaveResult =
  | { ok: true; tripId: string }
  | { ok: false; error: string };

/**
 * Saves a freshly generated itinerary as a new trip.
 *
 * Written parent-first so a failure part way leaves an obviously incomplete
 * trip rather than orphaned rows: the trip is marked `generating` until every
 * child has landed, and only then becomes `ready`. A caller that dies in the
 * middle leaves a trip the user can see and delete, not invisible debris.
 */
export async function saveItinerary(
  supabase: SupabaseClient,
  userId: string,
  itinerary: Itinerary,
  opts: { title?: string; startDate?: string } = {},
): Promise<SaveResult> {
  const title =
    opts.title?.trim() ||
    `${itinerary.from.name.split(',')[0]} → ${itinerary.to.name.split(',')[0]}`;

  const { data: trip, error: tripErr } = await supabase
    .from('trips')
    .insert({
      user_id: userId,
      title,
      origin_name: itinerary.from.name,
      origin_lat: itinerary.from.at.lat,
      origin_lon: itinerary.from.at.lon,
      dest_name: itinerary.to.name,
      dest_lat: itinerary.to.at.lat,
      dest_lon: itinerary.to.at.lon,
      start_date: opts.startDate ?? null,
      mode: itinerary.mode,
      travellers: itinerary.budget.travellers,
      currency: itinerary.budget.currency,
      status: 'generating',
      distance_km: itinerary.distanceKm.value,
      driving_minutes: Math.round(itinerary.drivingHours.value * 60),
      route_provider:
        itinerary.distanceKm.provenance.kind === 'verified'
          ? itinerary.distanceKm.provenance.source
          : null,
    })
    .select('id')
    .single();

  if (tripErr || !trip) return { ok: false, error: tripErr?.message ?? 'could not create the trip' };
  const tripId = trip.id as string;

  // --- days -----------------------------------------------------------------
  const dayNumbers = [...new Set(itinerary.stops.map((s) => s.day))].sort((a, b) => a - b);
  const { data: days, error: dayErr } = await supabase
    .from('trip_days')
    .insert(
      dayNumbers.map((n) => ({
        trip_id: tripId,
        day_number: n,
        distance_km: Math.max(
          0,
          ...itinerary.stops.filter((s) => s.day === n).map((s) => s.distanceKm),
        ),
      })),
    )
    .select('id, day_number');

  if (dayErr) return { ok: false, error: `days: ${dayErr.message}` };
  const dayId = new Map((days ?? []).map((d) => [d.day_number as number, d.id as string]));

  // --- items ----------------------------------------------------------------
  const { error: itemErr } = await supabase.from('itinerary_items').insert(
    itinerary.stops.map((s, i) => ({
      trip_id: tripId,
      day_id: dayId.get(s.day) ?? null,
      position: i,
      kind: s.kind,
      // A stop with a real venue is named after it; one without says what it is.
      title: s.chosen?.name ?? defaultTitle(s.kind),
      start_time: s.arriveClock,
      duration_min: s.durationMin,
      place_name: s.chosen?.name ?? null,
      lat: s.chosen?.at.lat ?? s.at.lat,
      lon: s.chosen?.at.lon ?? s.at.lon,
      distance_km: s.distanceKm,
      opening_hours: s.chosen?.openingHours ?? null,
      rating: s.chosen?.rating ?? null,
      provenance: s.chosen ? toColumn(s.placesStatus.provenance) : 'estimated',
      provider: s.chosen?.provider ?? providerOf(s.placesStatus.provenance),
      provider_ref: s.chosen?.id ?? null,
      reason: s.reason,
    })),
  );
  if (itemErr) return { ok: false, error: `items: ${itemErr.message}` };

  // --- budget ---------------------------------------------------------------
  const { error: budgetErr } = await supabase.from('budget_items').insert(
    itinerary.budget.lines.map((l) => ({
      trip_id: tripId,
      category: l.label,
      label: l.label,
      amount: l.amount.value,
      currency: itinerary.budget.currency,
      provenance: toColumn(l.amount.provenance),
      workings: l.workings,
    })),
  );
  if (budgetErr) return { ok: false, error: `budget: ${budgetErr.message}` };

  // Only now is the trip complete enough to show as ready. A provider that was
  // unavailable is a partial result, and the status says so rather than
  // pretending the trip is whole.
  const anyUnavailable = itinerary.stops.some(
    (s) => s.placesStatus.provenance.kind === 'unavailable',
  );
  await supabase
    .from('trips')
    .update({ status: anyUnavailable ? 'partially_ready' : 'ready' })
    .eq('id', tripId);

  return { ok: true, tripId };
}

function defaultTitle(kind: string): string {
  const names: Record<string, string> = {
    depart: 'Depart', arrive: 'Arrive', rest: 'Rest stop', fuel: 'Fuel stop',
    breakfast: 'Breakfast', lunch: 'Lunch', tea: 'Tea break', dinner: 'Dinner',
    overnight: 'Overnight stop',
  };
  return names[kind] ?? kind;
}

/** A user's trips, newest first. RLS limits this to their own. */
export async function listTrips(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('trips')
    .select('id, title, origin_name, dest_name, start_date, mode, status, distance_km, driving_minutes, currency, updated_at')
    .order('updated_at', { ascending: false })
    .limit(50);
  return error ? { ok: false as const, error: error.message } : { ok: true as const, data: data ?? [] };
}

/** One trip with everything hanging off it. Returns null if it is not theirs. */
export async function getTrip(supabase: SupabaseClient, tripId: string) {
  const { data: trip, error } = await supabase
    .from('trips')
    .select('*')
    .eq('id', tripId)
    .maybeSingle();
  if (error) return { ok: false as const, error: error.message };
  if (!trip) return { ok: false as const, error: 'not found' };

  const [days, items, budget, packing] = await Promise.all([
    supabase.from('trip_days').select('*').eq('trip_id', tripId).order('day_number'),
    supabase.from('itinerary_items').select('*').eq('trip_id', tripId).order('position'),
    supabase.from('budget_items').select('*').eq('trip_id', tripId),
    supabase.from('packing_items').select('*').eq('trip_id', tripId).order('position'),
  ]);

  return {
    ok: true as const,
    data: {
      trip,
      days: days.data ?? [],
      items: items.data ?? [],
      budget: budget.data ?? [],
      packing: packing.data ?? [],
    },
  };
}

/**
 * Stores the generated plan whole, as JSON, one row per trip.
 *
 * Upsert on trip_id rather than insert: section 7 is explicit that editing or
 * regenerating must update the existing record instead of accumulating
 * duplicates, and the unique constraint plus this one call is a stronger
 * guarantee than remembering to look first.
 *
 * user_id comes from the caller's verified session. RLS checks it against both
 * the row and the trip, so a mismatch is rejected by the database rather than
 * trusted here.
 */
export async function saveItinerarySnapshot(
  supabase: SupabaseClient,
  userId: string,
  tripId: string,
  itinerary: Itinerary,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from('itineraries')
    .upsert(
      {
        trip_id: tripId,
        user_id: userId,
        itinerary_data: itinerary as unknown as Record<string, unknown>,
        generated_at: itinerary.generatedAt,
      },
      { onConflict: 'trip_id' },
    );

  if (error) {
    console.error('[saveItinerarySnapshot]', error.code, error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** The stored plan for one trip, or null. RLS scopes this to the owner. */
export async function getItinerarySnapshot(supabase: SupabaseClient, tripId: string) {
  const { data, error } = await supabase
    .from('itineraries')
    .select('itinerary_data, generated_at, updated_at')
    .eq('trip_id', tripId)
    .maybeSingle();
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, data };
}
