/**
 * Which external providers are actually configured.
 *
 * The product rule is that nothing is presented as fact without a live source.
 * That only works if the code knows, at request time, which sources exist. This
 * module is the single place that answers it, so a route never has to guess and
 * never silently degrades without saying so.
 *
 * README's degradation table is the contract:
 *   routing missing -> distances become estimates, verified = false
 *   places missing  -> attractions and food become AI suggestions by area
 *   weather missing -> climate normals, labelled as such
 *   hotels missing  -> price bands only, never listings
 *   AI missing      -> generation returns 503; no partial trip is written
 */

export type ProviderId = 'ai' | 'routing' | 'places' | 'weather' | 'hotels';

export type ProviderStatus = {
  id: ProviderId;
  configured: boolean;
  provider: string | null;
  /** What the user is told when this one is missing. */
  degradation: string;
};

const SPEC: Record<ProviderId, { key: string; name: string; degradation: string }> = {
  ai: {
    key: 'AI_API_KEY',
    name: 'AI_PROVIDER',
    degradation:
      'No AI provider is configured, so the day-by-day plan cannot be written. ' +
      'You still get the trip, its dates, a packing list and the budget categories.',
  },
  routing: {
    key: 'MAPS_API_KEY',
    name: 'MAPS_PROVIDER',
    degradation:
      'No routing provider, so distances and durations are unmeasured rather than estimated.',
  },
  places: {
    key: 'PLACES_API_KEY',
    name: 'PLACES_PROVIDER',
    degradation:
      'No places provider, so attractions and restaurants are not suggested.',
  },
  weather: {
    key: 'WEATHER_API_KEY',
    name: 'WEATHER_PROVIDER',
    degradation: 'No weather provider, so no forecast or climate normals are attached.',
  },
  hotels: {
    key: 'HOTELS_API_KEY',
    name: 'HOTELS_PROVIDER',
    degradation:
      'No hotels provider, so stays are not suggested. Nothing is invented in their place.',
  },
};

export function providerStatus(id: ProviderId): ProviderStatus {
  const spec = SPEC[id];
  const key = process.env[spec.key];
  return {
    id,
    configured: Boolean(key && key.trim()),
    provider: process.env[spec.name]?.trim() || null,
    degradation: spec.degradation,
  };
}

export function allProviders(): ProviderStatus[] {
  return (Object.keys(SPEC) as ProviderId[]).map(providerStatus);
}

/** The subset a response should tell the client about, so the UI can label rows. */
export function degradationNotices(): string[] {
  return allProviders().filter((p) => !p.configured).map((p) => p.degradation);
}
