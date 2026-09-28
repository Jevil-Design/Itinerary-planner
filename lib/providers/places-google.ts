import type { LatLon, Place, ProviderResult } from './types.ts';
import { haversine } from './routing.ts';
import type { PlaceKind } from './places.ts';

/**
 * Places from the Google Places API (New).
 *
 * This exists because the free alternative does not hold up. Overpass was
 * measured against this exact route and the public mirrors timed out at 70
 * seconds on an eight-point query, leaving most stops with no venue. Google
 * answers a nearby search in well under a second and carries opening hours and
 * ratings, which are the fields sections 7 and 8 actually depend on.
 *
 * The key is read on the server and never reaches the browser. It is optional:
 * with no key the planner falls back to Overpass and, failing that, says the
 * data is unavailable. It never invents a place.
 */

export const PROVIDER = 'Google Places';

/** Places API types, chosen to match what each stop is for. */
const TYPES: Record<PlaceKind, string[]> = {
  restaurant: ['restaurant', 'cafe'],
  fuel: ['gas_station'],
  hotel: ['lodging'],
  attraction: ['tourist_attraction', 'museum'],
  viewpoint: ['tourist_attraction'],
  toilets: ['public_bathroom'],
};

export function googlePlacesKey(): string {
  return (process.env.GOOGLE_PLACES_API_KEY ?? process.env.MAPS_API_KEY ?? '').trim();
}

export const googlePlacesConfigured = (): boolean => googlePlacesKey().length > 10;

type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  primaryType?: string;
  regularOpeningHours?: { weekdayDescriptions?: string[]; openNow?: boolean };
  nationalPhoneNumber?: string;
};

export async function findPlacesGoogle(
  near: LatLon,
  kind: PlaceKind,
  radius: number,
  limit: number,
  signal?: AbortSignal,
): Promise<ProviderResult<Place[]>> {
  const key = googlePlacesKey();
  if (!key) return { ok: false, error: 'no API key configured', provider: PROVIDER };

  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Goog-Api-Key': key,
        // Asking only for the fields we use keeps this in the cheaper SKU.
        'X-Goog-FieldMask': [
          'places.id',
          'places.displayName',
          'places.location',
          'places.rating',
          'places.primaryType',
          'places.regularOpeningHours',
          'places.nationalPhoneNumber',
        ].join(','),
      },
      body: JSON.stringify({
        includedTypes: TYPES[kind],
        maxResultCount: Math.min(20, limit * 2),
        locationRestriction: {
          circle: { center: { latitude: near.lat, longitude: near.lon }, radius: Math.min(50_000, radius) },
        },
        rankPreference: 'DISTANCE',
      }),
      signal: signal ?? AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      // The key being wrong is worth saying plainly; it is the likeliest cause.
      const hint = res.status === 403 ? ' (key rejected — check Places API is enabled and the key is unrestricted for this use)' : '';
      return { ok: false, error: `HTTP ${res.status}${hint}: ${body.slice(0, 120)}`, provider: PROVIDER };
    }

    const json = (await res.json()) as { places?: GooglePlace[] };
    const places = (json.places ?? [])
      .map((p): Place | null => {
        const lat = p.location?.latitude;
        const lon = p.location?.longitude;
        const name = p.displayName?.text?.trim();
        if (lat == null || lon == null || !name) return null;
        const at = { lat, lon };
        return {
          id: p.id ?? `${lat},${lon}`,
          name,
          category: p.primaryType ?? kind,
          at,
          detourMetres: Math.round(haversine(near, at)),
          // Only set when Google actually returned one. No default rating.
          rating: typeof p.rating === 'number' ? p.rating : undefined,
          openingHours: p.regularOpeningHours?.weekdayDescriptions?.join('; '),
          phone: p.nationalPhoneNumber,
          provider: PROVIDER,
        };
      })
      .filter((p): p is Place => p !== null)
      .slice(0, limit);

    return { ok: true, data: places };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: /abort|timeout/i.test(msg) ? 'timed out' : msg.slice(0, 120),
      provider: PROVIDER,
    };
  }
}
