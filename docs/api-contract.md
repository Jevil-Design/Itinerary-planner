# API contract

Every route lives under `app/api/`. All of them:

- authenticate via the Supabase server client reading the auth cookie — no route trusts a `user_id` from the request body;
- return `{ error: { code, message } }` with a real HTTP status on failure;
- hold every private key server-side.

`:id` is always a trip UUID unless stated otherwise.

---

## Auth

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/auth/signup` | `{ email, password, full_name }` | `201 { user }` — the `profiles` row is created by the `on_auth_user_created` trigger |
| POST | `/api/auth/login` | `{ email, password }` | `200 { user, session }` |
| POST | `/api/auth/logout` | — | `204` |
| POST | `/api/auth/reset-password` | `{ email }` | `202` — always `202`, even for an unknown address, so the endpoint cannot be used to enumerate users |
| POST | `/api/auth/update-password` | `{ password }` | `200` — requires a valid recovery session |

Google OAuth is a client-side `signInWithOAuth({ provider: 'google' })` plus the `/auth/callback` route handler that exchanges the code. It does not need an API route of its own.

---

## Trips

| Method | Path | Notes |
|---|---|---|
| GET | `/api/trips` | Query: `q`, `mode`, `status`, `sort` (`newest`\|`oldest`\|`upcoming`\|`duration`), `page`, `limit`. Returns `{ trips, total }`. |
| POST | `/api/trips` | Body is the create-trip form. Validated with the shared zod schema. Returns `201 { trip }` with `status: 'Draft'`. |
| GET | `/api/trips/:id` | Returns the full graph: `{ trip, routes, days: [{ …, activities }], hotels, restaurants, sightseeing, expenses, packing_items, checklist, share }`. One round trip — the client never fans out. |
| PUT | `/api/trips/:id` | Partial update of trip fields. |
| DELETE | `/api/trips/:id` | Cascades to all 8 child tables via FK `on delete cascade`. |
| POST | `/api/trips/:id/duplicate` | Body: `{ start_date?, end_date?, travellers?, budget_type?, destination?, travel_mode? }`. Copies the graph, resets `status` to `Draft`, clears all `actual_amount` values. |

---

## Generation

| Method | Path | Notes |
|---|---|---|
| POST | `/api/trips/:id/generate` | The full pipeline. Streams progress as SSE so the UI can show the twelve-step checklist. Ends by calling `save_generated_trip(trip_id, payload)` — **one transaction**, so a failure leaves no half-built trip. |
| POST | `/api/trips/:id/regenerate` | Body: `{ day_number }`. Rebuilds one day, leaves the rest alone, then calls `recalculate_trip_totals`. |
| POST | `/api/trips/:id/optimize` | Body: `{ day_number }`. Reorders that day by geography and opening hours without changing what is in it. |
| POST | `/api/assistant` | Body: `{ trip_id, message }`. The trip-aware assistant. Returns `{ reply, mutations }`, applies the mutations under the caller's RLS context, and recalculates. |

### The generate pipeline

```
validate input (zod)
  → routing service: legs, distances, durations, overnight halts
  → per-mode maths: fuel / toll / riding hours / rest cadence
  → places service: attractions filtered by interests
  → hotels service: three price bands per overnight halt
  → places service: restaurants per meal, filtered by food_preference
  → weather service: per-day forecast, or climate normals
  → AI: assemble the day-by-day schedule with real buffers
  → budget: 11 categories, per-person and per-day splits
  → packing list + pre-trip checklist from destination, season and mode
  → save_generated_trip(trip_id, payload)      ← single transaction
```

The AI is given the *retrieved* facts and asked to schedule them. It is never asked to invent a hotel, a price, an opening time or a schedule. Anything it estimates is written with `verified = false`.

---

## Itinerary

| Method | Path | Notes |
|---|---|---|
| GET | `/api/trips/:id/itinerary` | Days with nested activities, ordered. |
| POST | `/api/trips/:id/activities` | Create an activity. Body includes `day_id`. |
| PUT | `/api/activities/:id` | Update one activity: time, name, type, cost, description. |
| DELETE | `/api/activities/:id` | Delete, then re-index the day's `activity_order`. |
| PUT | `/api/trips/:id/activities/reorder` | Body: `{ day_id, ordered_ids: [] }`, or `{ from_day_id, to_day_id, activity_id, position }` to move across days. Runs as one transaction, then calls `recalculate_trip_totals`. |

Reordering is where the deferred `unique (day_id, activity_order)` constraint in the schema earns its place — the whole re-index happens inside one statement batch without tripping on intermediate collisions.

---

## Places, hotels, restaurants, sightseeing

| Method | Path | Notes |
|---|---|---|
| GET | `/api/trips/:id/places` | Everything mappable for the trip: activities with coordinates, hotels, restaurants, sightseeing, fuel stops. |
| GET | `/api/trips/:id/hotels` | Query: `location`, `category`. |
| GET | `/api/trips/:id/restaurants` | Query: `location`, `meal`. |
| GET | `/api/trips/:id/sightseeing` | Query: `priority`, `category`. |
| POST | `/api/saved-places` | Body: `{ name, location, place_type, latitude?, longitude?, notes? }`. Keyed to `auth.uid()`. |
| GET / DELETE | `/api/saved-places[/:id]` | List and remove. |

Every row in these responses carries `verified` and `source`. The client must render the label — do not drop it in a redesign.

---

## Weather and routing

| Method | Path | Notes |
|---|---|---|
| GET | `/api/weather` | Query: `lat`, `lng`, `date` (or `start`+`end`). Cached in `api_cache` for `CACHE_TTL_WEATHER`. Returns `{ source: 'live' \| 'normals', days: [...] }` — the client's label depends on `source`. |
| POST | `/api/routes/calculate` | Body: `{ waypoints: [...], mode }`. Returns legs with `distance_km`, `duration_minutes`, `polyline`, plus suggested breaks and fuel stops. Cached for `CACHE_TTL_ROUTING`. Returns `502 ROUTE_UNAVAILABLE` rather than a guess if the provider fails. |

---

## Budget and expenses

| Method | Path | Notes |
|---|---|---|
| GET | `/api/trips/:id/expenses` | All rows, estimate and actual together. |
| POST | `/api/trips/:id/expenses` | Create a row. |
| PUT | `/api/expenses/:id` | Update `estimated_amount`, `actual_amount`, or any other field. |
| DELETE | `/api/expenses/:id` | Delete. |
| GET | `/api/trips/:id/budget` | Derived view: totals, per-person, per-day, per-category percentages, estimated-vs-actual deltas, over/under. Computed server-side so the client and the PDF cannot disagree. |

---

## Packing and checklist

| Method | Path |
|---|---|
| GET / POST | `/api/trips/:id/packing` |
| PUT / DELETE | `/api/packing/:id` |
| GET / POST | `/api/trips/:id/checklist` |
| PUT / DELETE | `/api/checklist/:id` |

---

## Sharing

| Method | Path | Notes |
|---|---|---|
| POST | `/api/trips/:id/share` | Body: `{ show_budget }`. Creates or reactivates the share row. Returns `{ share_token, url }`. |
| DELETE | `/api/trips/:id/share` | Sets `is_active = false`. The old token stops working immediately. |
| POST | `/api/trips/:id/share/regenerate` | New token, old one revoked. |
| GET | `/api/share/:token` | **Unauthenticated.** Calls `public.get_shared_trip(token)`, which is `SECURITY DEFINER` and returns a redacted document. It never reads `profiles.email` or `profiles.phone`, and budget is included only when the share row says so. RLS is never relaxed to make sharing work. |

---

## Export

| Method | Path | Notes |
|---|---|---|
| POST | `/api/trips/:id/export/pdf` | Server-rendered from the saved trip record. 11 sections: summary, route, daily itinerary, stays, restaurants, sightseeing, budget, expenses, packing, checklist, travel information. |
| POST | `/api/trips/:id/export/excel` | 9 sheets: Trip Summary, Daily Itinerary, Hotels, Restaurants, Sightseeing, Routes, Budget, Expenses, Packing List. |

Both read from the database, not from client state, so an export always matches what is saved.

---

## Admin

| Method | Path | Notes |
|---|---|---|
| GET | `/api/admin/stats` | Users, trips, trips today, AI generations, popular destinations, travel-mode split. |
| GET | `/api/admin/api-usage` | Per-provider call counts, cache hit rate, error counts. |

Guarded twice: middleware checks `profiles.is_admin` before the handler runs, and the RLS policies themselves widen only for `public.is_admin()`. A non-admin session gets `403 FORBIDDEN`, not an empty list.

---

## Caching

`public.api_cache` is keyed `(provider, cache_key)` where `cache_key` is a deterministic hash of the request parameters. TTLs come from the environment. `expires_at` is indexed, and `public.purge_api_cache()` clears expired rows — schedule it with `pg_cron`.

AI generations are not cached: `CACHE_TTL_AI=0`.
