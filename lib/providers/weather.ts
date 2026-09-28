import type { DailyWeather, LatLon, ProviderResult } from './types.ts';

/**
 * Weather from Open-Meteo: real forecast data, no key, and explicit about how
 * far ahead it can see.
 *
 * Section 14 says never to present an estimate as verified weather. That is
 * handled by refusing to extrapolate: the provider forecasts about 16 days, and
 * for a date beyond that this returns no entry at all rather than a plausible
 * looking number. The planner then shows "Live data unavailable" for that day.
 */

const API = 'https://api.open-meteo.com/v1/forecast';
export const PROVIDER = 'Open-Meteo';

/** WMO weather codes, which is what the API speaks. */
const WMO: Record<number, string> = {
  0: 'Clear', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Rime fog',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
  66: 'Freezing rain', 67: 'Heavy freezing rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Light showers', 81: 'Showers', 82: 'Violent showers',
  85: 'Snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Severe thunderstorm with hail',
};

export const describeCode = (code: number): string => WMO[code] ?? 'Unknown';

/** Open-Meteo's free forecast horizon. Beyond this we have nothing honest to say. */
export const FORECAST_DAYS = 16;

export async function fetchWeather(
  at: LatLon,
  days: number,
  signal?: AbortSignal,
): Promise<ProviderResult<DailyWeather[]>> {
  const wanted = Math.min(Math.max(1, days), FORECAST_DAYS);
  const url =
    `${API}?latitude=${at.lat.toFixed(4)}&longitude=${at.lon.toFixed(4)}` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode` +
    `&forecast_days=${wanted}&timezone=auto`;

  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'contour-planner/1.0' },
      signal: signal ?? AbortSignal.timeout(20_000),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, provider: PROVIDER };

    const json = (await res.json()) as {
      daily?: {
        time?: string[];
        temperature_2m_max?: (number | null)[];
        temperature_2m_min?: (number | null)[];
        precipitation_probability_max?: (number | null)[];
        weathercode?: (number | null)[];
      };
    };
    const d = json.daily;
    if (!d?.time?.length) return { ok: false, error: 'no daily data returned', provider: PROVIDER };

    const out: DailyWeather[] = [];
    for (let i = 0; i < d.time.length; i++) {
      const maxC = d.temperature_2m_max?.[i];
      const minC = d.temperature_2m_min?.[i];
      // A null is the provider saying it does not know. Skip it rather than
      // coercing to 0, which would render as a real and very cold forecast.
      if (maxC == null || minC == null) continue;
      const code = d.weathercode?.[i] ?? 0;
      out.push({
        date: d.time[i],
        maxC,
        minC,
        rainChance: d.precipitation_probability_max?.[i] ?? 0,
        code,
        summary: describeCode(code),
      });
    }
    if (!out.length) return { ok: false, error: 'no usable days returned', provider: PROVIDER };
    return { ok: true, data: out };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: /abort|timeout/i.test(msg) ? 'timed out' : msg.slice(0, 120),
      provider: PROVIDER,
    };
  }
}

/**
 * Rain heavy enough to be worth moving an outdoor plan for. Used by the engine
 * to reorder sightseeing, and reported as the engine's judgement — the rain
 * figure is verified, the decision to move something is not.
 */
export const isWashout = (w: DailyWeather): boolean =>
  w.rainChance >= 70 || [65, 82, 95, 96, 99].includes(w.code);
