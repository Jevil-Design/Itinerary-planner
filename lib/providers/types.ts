/**
 * The shared vocabulary for everything that reaches the planner.
 *
 * The central idea is provenance. Section 2 of the brief draws a hard line
 * between a fact an external provider told us and a number the engine worked
 * out, and section 31 forbids inventing the former. Making provenance part of
 * the type — rather than a badge the UI remembers to add — means a value cannot
 * travel through the system without carrying where it came from, and a new
 * field cannot quietly default to looking verified.
 */

export type Provenance =
  /** A provider said this. `source` is shown to the user. */
  | { kind: 'verified'; source: string; fetchedAt: string }
  /** The engine worked this out. Never dressed up as fact. */
  | { kind: 'estimate'; basis: string }
  /** A provider was asked and could not answer. Shown as "Live data unavailable". */
  | { kind: 'unavailable'; reason: string; provider: string };

/** A value and where it came from, kept together so they cannot drift apart. */
export type Sourced<T> = { value: T; provenance: Provenance };

export const verified = <T>(value: T, source: string): Sourced<T> => ({
  value,
  provenance: { kind: 'verified', source, fetchedAt: new Date().toISOString() },
});

export const estimated = <T>(value: T, basis: string): Sourced<T> => ({
  value,
  provenance: { kind: 'estimate', basis },
});

export const unavailable = <T>(fallback: T, provider: string, reason: string): Sourced<T> => ({
  value: fallback,
  provenance: { kind: 'unavailable', provider, reason },
});

export type LatLon = { lat: number; lon: number };

export type TravelMode = 'car' | 'motorcycle' | 'bus' | 'train' | 'flight';

/** Modes the routing provider can actually draw a road route for. */
export const ROAD_MODES: TravelMode[] = ['car', 'motorcycle', 'bus'];

export type RouteLeg = {
  /** Metres, from the provider. */
  distance: number;
  /** Seconds of moving time, from the provider — excludes any stops. */
  duration: number;
};

export type RouteResult = {
  distance: Sourced<number>;
  duration: Sourced<number>;
  /** [lon, lat] pairs, provider geometry, used for the map and for stop placement. */
  geometry: LatLon[];
  legs: RouteLeg[];
  alternatives: number;
  provider: string;
};

export type Place = {
  id: string;
  name: string;
  category: string;
  at: LatLon;
  /** Straight-line metres from the point on the route we searched around. */
  detourMetres: number;
  /** OSM opening_hours syntax, when the data has it. Absent is common and honest. */
  openingHours?: string;
  cuisine?: string;
  phone?: string;
  /** Only ever set when a provider supplied it. There is no invented rating. */
  rating?: number;
  provider: string;
};

export type DailyWeather = {
  date: string;
  maxC: number;
  minC: number;
  rainChance: number;
  code: number;
  summary: string;
};

export type WeatherResult = Sourced<DailyWeather[]>;

/** Every provider returns this shape so a failure is data, never an exception. */
export type ProviderResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; provider: string };
