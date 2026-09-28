import { geocode } from '../providers/geocode.ts';
import { fetchRoute, pointAtFraction } from '../providers/routing.ts';
import { findPlaces, opensBy, type PlaceKind } from '../providers/places.ts';
import { fetchWeather, isWashout } from '../providers/weather.ts';
import { estimated, unavailable, verified, type Place, type Sourced, type TravelMode } from '../providers/types.ts';
import { buildSchedule, defaultsFor, type PlannedStop, type Preferences } from './engine.ts';
import { estimateBudget, type Budget } from './budget.ts';

/**
 * Turns a request into an itinerary, by asking real providers where the road
 * goes, what the weather will do, and what is actually at the places the stop
 * engine picked.
 *
 * The hard constraint running through this file is section 31: nothing is
 * invented. Every field is either verified with a named source, an estimate
 * with its basis stated, or explicitly unavailable. A provider that times out
 * produces "unavailable" and the itinerary still renders — it is never a
 * reason to fabricate a restaurant.
 */

export type ItineraryStop = PlannedStop & {
  at: { lat: number; lon: number };
  /** Real candidates from a provider. Empty means none were found, not none exist. */
  options: Place[];
  chosen: Place | null;
  /** Whether the chosen place is open on arrival. null = the data did not say. */
  openOnArrival: boolean | null;
  placesStatus: Sourced<number>;
};

export type Itinerary = {
  from: { query: string; name: string; at: { lat: number; lon: number } };
  to: { query: string; name: string; at: { lat: number; lon: number } };
  mode: TravelMode;
  distanceKm: Sourced<number>;
  drivingHours: Sourced<number>;
  routeAlternatives: number;
  geometry: { lat: number; lon: number }[];
  days: number;
  stops: ItineraryStop[];
  weather: Sourced<{ date: string; maxC: number; minC: number; rainChance: number; summary: string }[]>;
  advisories: string[];
  budget: Budget;
  generatedAt: string;
  /** Every provider consulted, and whether it answered. Surfaced in the UI. */
  providers: { name: string; ok: boolean; note: string }[];
};

/** Which kind of place a stop wants. Some stops want nothing. */
const WANTS: Partial<Record<PlannedStop['kind'], PlaceKind>> = {
  breakfast: 'restaurant',
  lunch: 'restaurant',
  tea: 'restaurant',
  dinner: 'restaurant',
  fuel: 'fuel',
  overnight: 'hotel',
  rest: 'restaurant',
};

export type PlanRequest = {
  from: string;
  to: string;
  mode: TravelMode;
  departAt?: string;
  travellers?: number;
  currency?: string;
  prefs?: Partial<Preferences>;
  /** Total wall-clock budget for provider calls. */
  deadlineMs?: number;
};

export async function planTrip(req: PlanRequest): Promise<{ ok: true; data: Itinerary } | { ok: false; error: string }> {
  const providers: Itinerary['providers'] = [];
  const started = Date.now();
  const deadline = req.deadlineMs ?? 55_000;
  const remaining = () => Math.max(1_000, deadline - (Date.now() - started));

  // --- 1. where are these places ----------------------------------------
  const [fromHit, toHit] = await Promise.all([geocode(req.from), geocode(req.to)]);
  if (!fromHit.ok) return { ok: false, error: `Could not find "${req.from}": ${fromHit.error}` };
  if (!toHit.ok) return { ok: false, error: `Could not find "${req.to}": ${toHit.error}` };
  providers.push({ name: 'Nominatim (OpenStreetMap)', ok: true, note: 'geocoding' });

  // --- 2. the actual road ------------------------------------------------
  const route = await fetchRoute({ from: fromHit.data.at, to: toHit.data.at, mode: req.mode });
  if (!route.ok) {
    providers.push({ name: route.provider, ok: false, note: route.error });
    return { ok: false, error: `No route could be calculated: ${route.error}` };
  }
  providers.push({ name: route.data.provider, ok: true, note: `${route.data.alternatives} route option(s)` });

  const distanceKm = route.data.distance.value / 1000;
  const drivingMin = route.data.duration.value / 60;

  // --- 3. when the traveller will be where -------------------------------
  const prefs: Preferences = { ...defaultsFor(req.mode), ...(req.prefs ?? {}) };
  if (req.departAt) prefs.departAt = req.departAt;
  const schedule = buildSchedule(drivingMin, distanceKm, prefs);

  // --- 4. weather, for as many days as the trip runs ----------------------
  const wx = await fetchWeather(toHit.data.at, schedule.days, AbortSignal.timeout(Math.min(20_000, remaining())));
  const advisories: string[] = [];
  let weather: Itinerary['weather'];
  if (wx.ok) {
    providers.push({ name: 'Open-Meteo', ok: true, note: `${wx.data.length} day forecast` });
    weather = verified(
      wx.data.map((d) => ({ date: d.date, maxC: d.maxC, minC: d.minC, rainChance: d.rainChance, summary: d.summary })),
      'Open-Meteo',
    );
    for (const d of wx.data.slice(0, schedule.days)) {
      if (isWashout(d)) {
        advisories.push(
          `${d.date}: ${d.summary.toLowerCase()} with ${d.rainChance}% chance of rain at the destination. ` +
            `Consider moving outdoor plans earlier.`,
        );
      }
    }
  } else {
    providers.push({ name: 'Open-Meteo', ok: false, note: wx.error });
    weather = unavailable([], 'Open-Meteo', wx.error);
  }

  // --- 5. real places at each stop ---------------------------------------
  /*
   * Overpass answers in seconds, not milliseconds, and a trip has many stops.
   * Fetching them in parallel under one shared deadline keeps the whole request
   * inside a serverless timeout; whatever has not answered by then is reported
   * unavailable rather than waited on or invented.
   */
  const needing = schedule.stops.filter((s) => WANTS[s.kind]);

  /*
   * When the places provider is down, asking it once per stop just multiplies
   * the timeout: eight stops turned a plan into a 52 second request that
   * answered "unavailable" anyway. After a few consecutive failures the rest
   * are reported unavailable immediately, which is the same answer, sooner.
   */
  let consecutiveFailures = 0;
  const results = await mapWithLimit(needing, OVERPASS_CONCURRENCY, async (stop) => {
    const at = pointAtFraction(route.data.geometry, stop.routeFraction);
    const kind = WANTS[stop.kind]!;

    if (consecutiveFailures >= PLACES_FAILURE_LIMIT) {
      return {
        stop,
        at,
        found: { ok: false as const, error: 'provider unavailable — not retried', provider: 'places' },
      };
    }

    const found = await findPlaces({
      near: at,
      kind,
      radius: stop.kind === 'overnight' ? 12_000 : 6_000,
      limit: 5,
      signal: AbortSignal.timeout(Math.min(15_000, remaining())),
    });
    if (found.ok) consecutiveFailures = 0;
    else consecutiveFailures += 1;
    return { stop, at, found };
  });

  const byStop = new Map(results.map((r) => [r.stop, r]));
  let overpassOk = 0;
  let overpassFail = 0;

  const stops: ItineraryStop[] = schedule.stops.map((stop) => {
    const r = byStop.get(stop);
    const at = r?.at ?? pointAtFraction(route.data.geometry, stop.routeFraction);

    if (!r) {
      return {
        ...stop, at, options: [], chosen: null, openOnArrival: null,
        placesStatus: estimated(0, 'this stop does not need a venue'),
      };
    }
    if (!r.found.ok) {
      overpassFail++;
      return {
        ...stop, at, options: [], chosen: null, openOnArrival: null,
        placesStatus: unavailable(0, r.found.provider, r.found.error),
      };
    }

    overpassOk++;
    const options = r.found.data;
    /*
     * Section 8: do not send someone to a place that opens after they arrive.
     * A venue whose hours say it is shut is dropped; one with no hours data is
     * kept but never labelled open, because absence of data is not evidence.
     */
    const usable = options.filter((p) => opensBy(p.openingHours, stop.arriveClock) !== false);
    const chosen = usable[0] ?? null;

    return {
      ...stop,
      at,
      options: usable,
      chosen,
      openOnArrival: chosen ? opensBy(chosen.openingHours, stop.arriveClock) : null,
      placesStatus: verified(usable.length, r.found.data[0]?.provider ?? 'OpenStreetMap (Overpass)'),
    };
  });

  if (overpassOk || overpassFail) {
    providers.push({
      name: 'OpenStreetMap (Overpass)',
      ok: overpassOk > 0,
      note: `${overpassOk} stop(s) resolved, ${overpassFail} unavailable`,
    });
  }

  const budget = estimateBudget({
    distanceKm,
    mode: req.mode,
    nights: Math.max(0, schedule.days - 1),
    travellers: req.travellers ?? 1,
    stops: stops.map((s) => s.kind),
    currency: req.currency ?? 'INR',
  });

  return {
    ok: true,
    data: {
      from: { query: req.from, name: fromHit.data.name, at: fromHit.data.at },
      to: { query: req.to, name: toHit.data.name, at: toHit.data.at },
      mode: req.mode,
      distanceKm: verified(Math.round(distanceKm * 10) / 10, route.data.provider),
      drivingHours: verified(Math.round((drivingMin / 60) * 100) / 100, route.data.provider),
      routeAlternatives: route.data.alternatives,
      // Thinned for transport: 10,000 points is accurate and unusable over the wire.
      geometry: thin(route.data.geometry, 400),
      days: schedule.days,
      stops,
      weather,
      advisories,
      budget,
      generatedAt: new Date().toISOString(),
      providers,
    },
  };
}

/**
 * Overpass mirrors throttle by IP. Firing every stop's query at once got 9 of
 * 10 rejected and produced an itinerary that was honest but empty; two at a
 * time is what the public mirrors actually tolerate. Slower, and far more of
 * the trip comes back with real places on it.
 */
const OVERPASS_CONCURRENCY = 2;

/** Consecutive provider failures after which the rest are not attempted. */
const PLACES_FAILURE_LIMIT = 3;

/** Promise.all with a ceiling on how many run at once, preserving input order. */
async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Keeps the shape of the line while cutting the point count for the map. */
function thin<T>(points: T[], max: number): T[] {
  if (points.length <= max) return points;
  const step = points.length / max;
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(points[Math.floor(i * step)]);
  out.push(points[points.length - 1]);
  return out;
}
