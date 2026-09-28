import type { LatLon, ProviderResult } from './types.ts';

/**
 * Turning "Kolkata" into coordinates, via Nominatim (OpenStreetMap).
 *
 * Nominatim's usage policy asks for an identifying user agent and at most one
 * request a second. Both are honoured here — a planner that gets itself blocked
 * is a planner that stops working for everyone.
 */

const API = 'https://nominatim.openstreetmap.org/search';
export const PROVIDER = 'Nominatim (OpenStreetMap)';

export type GeocodeHit = { name: string; at: LatLon; type: string };

let lastCall = 0;

/** Nominatim asks for no more than one request a second. */
async function throttle(): Promise<void> {
  const wait = 1_100 - (Date.now() - lastCall);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
}

export async function geocode(
  query: string,
  signal?: AbortSignal,
): Promise<ProviderResult<GeocodeHit>> {
  const q = query.trim();
  if (!q) return { ok: false, error: 'empty query', provider: PROVIDER };

  await throttle();
  const url = `${API}?q=${encodeURIComponent(q)}&format=json&limit=1&addressdetails=0`;

  try {
    const res = await fetch(url, {
      headers: {
        // Nominatim blocks requests without a real identifying agent.
        'user-agent': 'contour-planner/1.0 (travel itinerary planner)',
        'accept-language': 'en',
      },
      signal: signal ?? AbortSignal.timeout(20_000),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, provider: PROVIDER };

    const json = (await res.json()) as { display_name?: string; lat?: string; lon?: string; type?: string }[];
    const hit = json?.[0];
    if (!hit?.lat || !hit?.lon) return { ok: false, error: `nothing found for "${q}"`, provider: PROVIDER };

    return {
      ok: true,
      data: {
        name: hit.display_name ?? q,
        at: { lat: Number(hit.lat), lon: Number(hit.lon) },
        type: hit.type ?? 'place',
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: /abort|timeout/i.test(msg) ? 'timed out' : msg.slice(0, 120),
      provider: PROVIDER,
    };
  }
}
