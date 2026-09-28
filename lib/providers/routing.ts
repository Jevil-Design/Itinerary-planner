import type { LatLon, ProviderResult, RouteResult, TravelMode } from './types.ts';
import { verified } from './types.ts';

/**
 * Routing. OSRM's public server, which needs no key and returns real road
 * distance, real driving duration and real geometry.
 *
 * Deliberately behind this interface: swapping in Google Directions or Mapbox
 * later is a matter of writing another function with the same signature, and
 * those need a key held server-side. Nothing here belongs in the browser —
 * OSRM is keyless, but the route is also the input to the stop engine, which
 * runs on the server.
 */

const OSRM = 'https://router.project-osrm.org';

/**
 * OSRM's public server offers driving, cycling and walking only. A motorcycle
 * follows the road network a car does, so driving is the honest approximation;
 * where that matters (hill roads, daylight) the engine handles it separately
 * rather than pretending the provider modelled a motorcycle.
 */
const osrmProfile = (mode: TravelMode): string => (mode === 'bus' ? 'driving' : 'driving');

export type RouteRequest = {
  from: LatLon;
  to: LatLon;
  mode: TravelMode;
  signal?: AbortSignal;
};

export async function fetchRoute(req: RouteRequest): Promise<ProviderResult<RouteResult>> {
  const provider = 'OSRM (router.project-osrm.org)';
  const coords = `${req.from.lon},${req.from.lat};${req.to.lon},${req.to.lat}`;
  const url =
    `${OSRM}/route/v1/${osrmProfile(req.mode)}/${coords}` +
    `?overview=full&geometries=geojson&alternatives=true&steps=false`;

  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'contour-planner/1.0' },
      signal: req.signal ?? AbortSignal.timeout(45_000),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, provider };

    const json = (await res.json()) as {
      code?: string;
      routes?: { distance: number; duration: number; geometry?: { coordinates: [number, number][] } }[];
    };
    if (json.code !== 'Ok' || !json.routes?.length) {
      return { ok: false, error: `no route (${json.code ?? 'unknown'})`, provider };
    }

    const best = json.routes[0];
    const geometry: LatLon[] = (best.geometry?.coordinates ?? []).map(([lon, lat]) => ({ lat, lon }));
    if (geometry.length < 2) return { ok: false, error: 'route had no geometry', provider };

    return {
      ok: true,
      data: {
        distance: verified(best.distance, provider),
        duration: verified(best.duration, provider),
        geometry,
        legs: [{ distance: best.distance, duration: best.duration }],
        alternatives: json.routes.length,
        provider,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: /abort|timeout/i.test(msg) ? 'timed out' : msg.slice(0, 120), provider };
  }
}

/** Metres between two points on a sphere. Used to walk the geometry, not for display. */
export function haversine(a: LatLon, b: LatLon): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Where the traveller is after a given fraction of the route.
 *
 * This is what makes a stop route-aware rather than a guess: the geometry is
 * walked by cumulative distance, so "where am I at 07:45" resolves to a real
 * point on the real road, and a restaurant search happens around that point
 * instead of around a famous city that happens to be roughly on the way.
 */
export function pointAtFraction(geometry: LatLon[], fraction: number): LatLon {
  if (geometry.length === 0) throw new Error('empty geometry');
  if (geometry.length === 1) return geometry[0];
  const f = Math.min(1, Math.max(0, fraction));

  const cumulative: number[] = [0];
  for (let i = 1; i < geometry.length; i++) {
    cumulative.push(cumulative[i - 1] + haversine(geometry[i - 1], geometry[i]));
  }
  const total = cumulative[cumulative.length - 1];
  if (total === 0) return geometry[0];

  const target = total * f;
  for (let i = 1; i < cumulative.length; i++) {
    if (cumulative[i] >= target) {
      const segment = cumulative[i] - cumulative[i - 1];
      const t = segment === 0 ? 0 : (target - cumulative[i - 1]) / segment;
      const a = geometry[i - 1];
      const b = geometry[i];
      return { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t };
    }
  }
  return geometry[geometry.length - 1];
}
