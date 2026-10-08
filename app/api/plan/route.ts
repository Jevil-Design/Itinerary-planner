import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/user';
import { userClient } from '@/lib/supabase/server';
import { saveItinerary, saveItinerarySnapshot } from '@/lib/trips/persist';
import { planTrip } from '@/lib/plan/itinerary';

/**
 * Plan a trip from real provider data.
 *
 * Runs on the server for two reasons: the places key must never reach a
 * browser, and the stop engine needs the full route geometry, which is far too
 * large to ship to the client and back.
 *
 * Nothing is written anywhere. The itinerary is computed, returned, and
 * forgotten — the same storage posture as the rest of the app.
 */

export const dynamic = 'force-dynamic';
/** Providers are slow; OSRM alone can take several seconds. */
export const maxDuration = 60;

const Body = z.object({
  from: z.string().min(2).max(120),
  to: z.string().min(2).max(120),
  mode: z.enum(['car', 'motorcycle', 'bus', 'train', 'flight']),
  departAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  travellers: z.number().int().min(1).max(20).optional(),
  currency: z.enum(['INR', 'USD', 'EUR', 'GBP']).optional(),
  prefs: z
    .object({
      restEveryMin: z.number().int().min(30).max(480).optional(),
      restDurationMin: z.number().int().min(5).max(120).optional(),
      maxDailyDriveMin: z.number().int().min(60).max(16 * 60).optional(),
      lastDrivingHour: z.number().int().min(12).max(24).optional(),
      fuelRangeKm: z.number().int().min(0).max(1200).optional(),
      breakfastMin: z.number().int().min(0).max(180).optional(),
      lunchMin: z.number().int().min(0).max(180).optional(),
      teaMin: z.number().int().min(0).max(180).optional(),
      dinnerMin: z.number().int().min(0).max(180).optional(),
    })
    .optional(),
});

const fail = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message } }, { status });

export async function POST(req: Request) {
  // Planning costs several provider calls, so it is gated like the planner.
  const user = await getCurrentUser();
  if (!user) return fail('UNAUTHENTICATED', 'Sign in to plan a trip.', 401);

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return fail('BAD_REQUEST', 'Expected a JSON body.', 400);
  }

  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return fail('BAD_REQUEST', `${first.path.join('.') || 'body'}: ${first.message}`, 400);
  }

  const { from, to, mode } = parsed.data;
  if (mode === 'train' || mode === 'flight') {
    return fail(
      'MODE_UNSUPPORTED',
      `No timetable provider is wired, so ${mode} journeys cannot be planned yet. ` +
        `Road modes (car, motorcycle, bus) use live routing.`,
      501,
    );
  }

  const result = await planTrip({ ...parsed.data, from, to, deadlineMs: 50_000 });
  if (!result.ok) return fail('PLAN_FAILED', result.error, 502);

  /*
   * Persist before answering. The user asked for a trip, not for a page that
   * forgets it on refresh — section 7. Both writes are scoped by RLS, and the
   * owner is the verified session rather than anything the request supplied.
   *
   * A failure here is reported alongside the itinerary rather than instead of
   * it: losing a generation that cost half a minute of provider calls because
   * the save failed would be the worse outcome.
   */
  const supabase = await userClient();
  let tripId: string | null = null;
  let saveError: string | null = null;

  const saved = await saveItinerary(supabase, user.id, result.data);
  if (saved.ok) {
    tripId = saved.tripId;
    const snapshot = await saveItinerarySnapshot(supabase, user.id, saved.tripId, result.data);
    if (!snapshot.ok) saveError = snapshot.error;
  } else {
    saveError = saved.error;
    console.error('[api/plan] could not save the trip', saved.error);
  }

  return NextResponse.json(
    { ...result.data, tripId, saved: saved.ok, saveError },
    {
      // A trip is personal and nothing about it should be cached by an intermediary.
      headers: { 'cache-control': 'no-store, private' },
    },
  );
}
