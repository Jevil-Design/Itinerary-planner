# Service interfaces

Every external dependency sits behind one interface with a named provider implementation. A route handler never knows which provider answered. Swapping providers is a one-line change in a factory; adding one is a new file.

The point is the brief's own requirement: *if a particular API is unavailable, create a modular service interface so another provider can easily be connected later.*

---

## The shared result type

No service throws for an expected failure. Each returns a discriminated union so the caller — and the UI — can tell a live answer from an estimate.

```ts
export type ServiceResult<T> =
  | { ok: true;  data: T; source: 'live'; provider: string; cached: boolean }
  | { ok: true;  data: T; source: 'estimate'; provider: 'ai' | 'normals'; note: string }
  | { ok: false; code: ServiceErrorCode; message: string };
```

`source` maps straight onto the `verified` column and onto the UI label:

| `source` | `verified` | UI label |
|---|---|---|
| `'live'` | `true` | `✓ Verified Information` |
| `'estimate'` | `false` | `✦ AI Recommendation — Verify Before Booking` |

This is the rule the whole product rests on. A service that cannot tell the difference is a bug.

---

## Routing

```ts
export interface RoutingService {
  readonly name: string;
  calculate(input: {
    waypoints: Array<{ lat: number; lng: number } | { query: string }>;
    mode: TravelMode;
  }): Promise<ServiceResult<{
    legs: Array<{
      from: string; to: string;
      distance_km: number; duration_minutes: number;
      polyline: string;
      suggested_breaks: Array<{ name: string; at_km: number }>;
    }>;
    total_distance_km: number;
    total_duration_minutes: number;
  }>>;

  /** Overnight halts for a multi-day road trip, respecting the mode's daily ceiling. */
  overnightHalts(input: {
    legs: RoutingLeg[];
    mode: TravelMode;
    max_daily_hours: number;
  }): Promise<ServiceResult<Array<{ name: string; lat: number; lng: number; at_km: number }>>>;
}
```

Implementations: `google`, `mapbox`, `ors` (OpenRouteService). Selected by `MAPS_PROVIDER`.

If routing is unavailable the service returns `{ ok: false, code: 'ROUTE_UNAVAILABLE' }`. The pipeline then falls back to an AI estimate written with `verified = false`, and the map renders a schematic waypoint projection with a visible caveat. **It does not invent a distance and present it as measured.**

### Per-mode ceilings

The routing result is only half the answer — the mode decides what a realistic day is. These live in `lib/itinerary/schedule.ts`, not in the provider:

| Mode | Max daily distance | Max daily hours | Break cadence |
|---|---|---|---|
| Bike | 550 km | 11 h | every 2 h or 150 km |
| Car | 700 km | 10 h | every 2.5 h |
| Bus | — | 12 h | at scheduled halts |
| Train | — | — | transfers + station transfer time |
| Flight | — | — | check-in buffer + airport transfers |
| Mixed | per segment | per segment | per segment |

---

## Places

```ts
export interface PlacesService {
  readonly name: string;

  attractions(input: {
    near: { lat: number; lng: number };
    radius_km: number;
    interests: Interest[];
    limit?: number;
  }): Promise<ServiceResult<SightseeingPlace[]>>;

  restaurants(input: {
    near: { lat: number; lng: number };
    radius_km: number;
    meal: Meal;
    food_preference: FoodPreference;
    price_band: PriceBand;
  }): Promise<ServiceResult<Restaurant[]>>;

  /** Fuel stations, parking, rest stops along a polyline. */
  alongRoute(input: {
    polyline: string;
    kinds: Array<'fuel' | 'parking' | 'rest' | 'atm' | 'hospital'>;
  }): Promise<ServiceResult<RoutePoint[]>>;
}
```

Implementations: `google`, `foursquare`, `overpass` (OpenStreetMap, no key needed — a reasonable default when no commercial key is configured).

---

## Weather

```ts
export interface WeatherService {
  readonly name: string;

  forecast(input: {
    lat: number; lng: number;
    from: string; to: string;   // ISO dates
  }): Promise<ServiceResult<Array<{
    date: string;
    temp_high: number; temp_low: number;
    condition: string;
    rain_probability: number;
    wind_kmh: number;
    sunrise: string; sunset: string;
    alerts: string[];
  }>>>;
}
```

Implementations: `openweather`, `weatherapi`, `tomorrow`.

Forecast horizons are short — most providers give 7–16 days. For a trip further out than that, the service returns `source: 'estimate'`, `provider: 'normals'` with monthly climate normals and a note. The UI must say *climate normals, not a live forecast*. Presenting normals as a forecast is the exact thing the brief forbids.

### Weather-driven rescheduling

`lib/itinerary/schedule.ts` consumes the forecast:

- rain probability > 60 % during an outdoor activity → move it to the driest window that day, or offer an indoor alternative from the sightseeing set;
- temperature < 5 °C before 08:00 on a bike day → push departure later and flag ice risk on shaded sections;
- a provider alert → surface it on the day card, never bury it.

Each adjustment is recorded on the activity so the UI can explain *why* something moved.

---

## Hotels

```ts
export interface HotelsService {
  readonly name: string;

  search(input: {
    location: string;
    check_in: string; check_out: string;
    guests: number; rooms: number;
    preference: HotelPreference;
  }): Promise<ServiceResult<Hotel[]>>;
}
```

There may be no implementation at all, and that is a supported state. With no `HOTELS_API_KEY` the factory returns `AiBandHotelsService`, which produces **price bands and areas to search** — not listings:

- `hotel_name` is descriptive, never a business name (`"Mid-range hotel, Hill Cart Road"`);
- `rating` and `review_count` are `null`, never a plausible-looking number;
- `price_per_night` is a band midpoint and the UI renders it as *approx.*;
- `booking_url` is `null`; the card offers **Find & verify** instead of **Book**;
- `verified = false`, always.

Fabricating a hotel name, price, rating or availability is the single worst failure this product can have. The interface is shaped to make it awkward.

Same reasoning applies to train and flight schedules: without a live source, the itinerary describes the *segment* (departure station, transfer, buffer, transfer) and never asserts a train number or a departure time.

---

## AI

```ts
export interface AiService {
  readonly name: string;

  /** Schedule already-retrieved facts into days. Does not invent places. */
  buildItinerary(input: {
    trip: Trip;
    routes: RoutingLeg[];
    halts: OvernightHalt[];
    attractions: SightseeingPlace[];
    restaurants: Restaurant[];
    hotels: Hotel[];
    weather: WeatherDay[];
  }): Promise<ServiceResult<GeneratedItinerary>>;

  /** Rebuild one day, leaving the rest untouched. */
  regenerateDay(input: { trip: Trip; day: ItineraryDay; context: TripContext })
    : Promise<ServiceResult<GeneratedDay>>;

  /** Trip-aware assistant. Returns prose plus a typed mutation list. */
  assist(input: { trip_context: TripContext; message: string })
    : Promise<ServiceResult<{ reply: string; mutations: Mutation[] }>>;
}
```

Implementations: `anthropic`, `openai`. Selected by `AI_PROVIDER`.

### Prompt rules, enforced in the service not the prompt alone

1. The model receives retrieved facts and schedules them. It is not asked to recall places from memory.
2. Output is parsed against a zod schema. A malformed response is retried once, then fails with `GENERATION_FAILED` — never partially written.
3. Anything the model adds that was not in the retrieved set is written with `verified = false`.
4. Schedules must leave slack: no activity may start within 15 minutes of the previous one ending, travel time is always explicit, and a day is capped by the mode's ceilings above. The validator rejects a schedule that fills every minute and asks for one retry.

### Mutations

The assistant cannot write SQL. It returns a closed set of typed operations, which the route handler applies under the caller's RLS context:

```ts
type Mutation =
  | { op: 'move_activity';    activity_id: string; to_day: number; position: number }
  | { op: 'update_activity';  activity_id: string; patch: Partial<Activity> }
  | { op: 'delete_activity';  activity_id: string }
  | { op: 'insert_activity';  day_number: number; activity: NewActivity }
  | { op: 'shift_day';        day_number: number; minutes: number }
  | { op: 'swap_hotel';       hotel_id: string; to_category: HotelCategory }
  | { op: 'update_expense';   expense_id: string; estimated_amount: number }
  | { op: 'add_day';          after_day: number; date: string };
```

Every mutation ends with `recalculate_trip_totals(trip_id)`. An unrecognised `op` is dropped and logged — it never becomes a raw write.

---

## Cache

```ts
export interface CacheService {
  get<T>(provider: Provider, key: string): Promise<T | null>;
  set<T>(provider: Provider, key: string, value: T, ttl_seconds: number): Promise<void>;
  purgeExpired(): Promise<number>;
}
```

Backed by `public.api_cache`, which has RLS enabled and no policies — service role only. `cache_key` is a stable hash of the request parameters, so identical requests collapse onto one provider call. TTLs come from the environment; AI generations are never cached.

---

## The factory

```ts
// lib/services/index.ts
export const services = {
  routing: makeRouting(process.env.MAPS_PROVIDER),
  places:  makePlaces(process.env.PLACES_PROVIDER),
  weather: makeWeather(process.env.WEATHER_PROVIDER),
  hotels:  makeHotels(process.env.HOTELS_PROVIDER),   // -> AI bands when unset
  ai:      makeAi(process.env.AI_PROVIDER),
  cache:   makeCache(),
};
```

Route handlers import `services` and nothing else. No handler reads `process.env` for a provider key, and no client component imports from `lib/services` at all — an ESLint boundary rule is worth adding to keep it that way.
