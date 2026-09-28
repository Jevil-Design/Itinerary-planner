import type { LatLon, Place, ProviderResult } from './types.ts';
import { haversine } from './routing.ts';
import { findPlacesGoogle, googlePlacesConfigured } from './places-google.ts';

/**
 * Places from OpenStreetMap, via Overpass.
 *
 * Two things learned by measuring rather than assuming, both of which shape
 * this file:
 *
 *   1. overpass-api.de returns 504 under load often enough that a single host
 *      is not a provider, it is an outage waiting to happen. Hence the mirror
 *      list, tried in order of observed reliability.
 *   2. Coverage outside cities is thin. A stretch of Indian highway may have
 *      one tagged restaurant in a 6 km radius, or none. That is not a bug to
 *      paper over: section 31 forbids inventing a restaurant, so when there is
 *      nothing the caller gets an empty list and the UI says so.
 */

const MIRRORS = [
  // Measured fastest and most reliable of the three; the official host 504s.
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

export const PROVIDER = 'OpenStreetMap (Overpass)';

export type PlaceKind = 'restaurant' | 'fuel' | 'hotel' | 'attraction' | 'viewpoint' | 'toilets';

/** OSM tag filters per kind. Only tags that really exist — nothing aspirational. */
const FILTERS: Record<PlaceKind, string[]> = {
  restaurant: ['node["amenity"~"^(restaurant|cafe|fast_food)$"]', 'way["amenity"~"^(restaurant|cafe|fast_food)$"]'],
  fuel: ['node["amenity"="fuel"]', 'way["amenity"="fuel"]'],
  hotel: ['node["tourism"~"^(hotel|guest_house|hostel|motel)$"]', 'way["tourism"~"^(hotel|guest_house|hostel|motel)$"]'],
  attraction: ['node["tourism"~"^(attraction|museum|artwork)$"]', 'way["tourism"~"^(attraction|museum|artwork)$"]'],
  viewpoint: ['node["tourism"="viewpoint"]', 'way["tourism"="viewpoint"]'],
  toilets: ['node["amenity"="toilets"]'],
};

type OverpassElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

export type PlaceQuery = {
  near: LatLon;
  kind: PlaceKind;
  /** Metres. Wider finds more but also finds places too far off the road. */
  radius?: number;
  limit?: number;
  signal?: AbortSignal;
};

/**
 * Queries each mirror in turn. A mirror that fails costs time, so the per-host
 * budget is deliberately short — a meal stop that takes a minute to resolve is
 * worse than one that honestly reports nothing.
 */
/**
 * Picks a provider and asks it.
 *
 * Google first when a key is present, because the free Overpass mirrors were
 * measured against a real 636 km route and timed out at 70 seconds on an
 * eight-point query — they cannot carry this feature. Overpass remains the
 * keyless fallback, tried on a short leash so a slow mirror degrades the
 * itinerary rather than hanging the request.
 */
export async function findPlaces(q: PlaceQuery): Promise<ProviderResult<Place[]>> {
  if (googlePlacesConfigured()) {
    const g = await findPlacesGoogle(q.near, q.kind, q.radius ?? 6_000, q.limit ?? 10, q.signal);
    if (g.ok) return g;
    // Fall through to Overpass: a rejected key should not mean no places at all.
  }
  return findPlacesOverpass(q);
}

async function findPlacesOverpass(q: PlaceQuery): Promise<ProviderResult<Place[]>> {
  const radius = q.radius ?? 6_000;
  const limit = q.limit ?? 10;
  const parts = FILTERS[q.kind]
    .map((f) => `${f}(around:${radius},${q.near.lat.toFixed(5)},${q.near.lon.toFixed(5)});`)
    .join('');
  const ql = `[out:json][timeout:25];(${parts});out center tags ${limit * 3};`;

  let lastError = 'no mirror answered';
  for (const host of MIRRORS) {
    try {
      const res = await fetch(host, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'user-agent': 'contour-planner/1.0',
        },
        body: 'data=' + encodeURIComponent(ql),
        signal: q.signal ?? AbortSignal.timeout(12_000),
      });
      if (!res.ok) { lastError = `${new URL(host).host}: HTTP ${res.status}`; continue; }

      const json = (await res.json()) as { elements?: OverpassElement[] };
      const places = (json.elements ?? [])
        .map((e): Place | null => {
          const at = e.lat != null && e.lon != null ? { lat: e.lat, lon: e.lon } : e.center;
          const name = e.tags?.name?.trim();
          // An unnamed point cannot be recommended to a traveller, and naming it
          // ourselves would be inventing a business.
          if (!at || !name) return null;
          return {
            id: `${e.type}/${e.id}`,
            name,
            category: e.tags?.amenity ?? e.tags?.tourism ?? q.kind,
            at,
            detourMetres: Math.round(haversine(q.near, at)),
            openingHours: e.tags?.opening_hours,
            cuisine: e.tags?.cuisine,
            phone: e.tags?.phone ?? e.tags?.['contact:phone'],
            provider: PROVIDER,
          };
        })
        .filter((p): p is Place => p !== null)
        .sort((a, b) => a.detourMetres - b.detourMetres)
        .slice(0, limit);

      return { ok: true, data: places };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      lastError = `${new URL(host).host}: ${/abort|timeout/i.test(msg) ? 'timed out' : msg.slice(0, 60)}`;
    }
  }
  return { ok: false, error: lastError, provider: PROVIDER };
}

/**
 * Whether an OSM opening_hours string plausibly covers a time.
 *
 * OSM's syntax is large and this reads only the common cases. That is why an
 * unparseable value returns null — "we do not know" — rather than true. A stop
 * is only ever advertised as open when the data actually said so; section 8
 * requires not sending someone to a place that opens at nine for a quarter to
 * eight breakfast, and guessing would do exactly that.
 */
export function opensBy(openingHours: string | undefined, hhmm: string): boolean | null {
  if (!openingHours) return null;
  const spec = openingHours.trim();
  if (/^24\/7$/i.test(spec)) return true;

  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const minutes = h * 60 + m;

  const ranges = [...spec.matchAll(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/g)];
  if (!ranges.length) return null;

  for (const r of ranges) {
    const open = Number(r[1]) * 60 + Number(r[2]);
    let close = Number(r[3]) * 60 + Number(r[4]);
    const overnight = close <= open;
    if (overnight) close += 24 * 60;
    // For a range like 18:00-02:00, 01:00 belongs to the *following* day, so it
    // has to be compared a day later as well — otherwise every small-hours time
    // reads as shut.
    const candidates = overnight ? [minutes, minutes + 24 * 60] : [minutes];
    if (candidates.some((m) => m >= open && m <= close)) return true;
  }
  return false;
}
