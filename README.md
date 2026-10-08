# Contour — AI Travel Itinerary Builder

Give it a source, a destination and dates. It builds the route, the day-by-day
schedule, what to pack and what it costs.

**Supabase is the backend of record.** Accounts, profiles, trips and the
itineraries they generate all live there, behind Row Level Security — so the
database, not the application, decides who can read a row. A trip survives a
refresh, a sign-out, and moving to another device.

---

## What is in this repository

| | |
|---|---|
| `app/` | The site: landing page, email and password sign-in, the dashboard, and the gated planner. |
| `lib/` | Supabase clients, the authenticated-user helpers, trip persistence, the travel providers and the planning engine. |
| `middleware.ts` | Refreshes the Supabase session and guards the private routes. |
| `supabase/` | Migrations and development seed data. |
| `prototype-build/` | The planner, generated from the design file. Deliberately outside `public/` — a statically served copy would be a way past the sign-in gate. Served only by `app/plan`, after the session check. |
| `Contour - AI Travel Itinerary Builder.dc.html` | The design file. The source of truth for the planner. |
| `scripts/` | Build and verification: prototype build, imagery fetch, auth and isolation tests, persistence tests, browser tests. |
| `docs/` | Authentication setup, and the DNS request for the sending subdomain. |

---

## Architecture

```
Browser
  └─ Next.js (App Router)
       └─ Supabase SSR auth          middleware refreshes the token
            └─ authenticated user     derived from a verified JWT, never from the request
                 └─ Supabase Postgres
                      profiles · trips · trip_days · itinerary_items · itineraries
                      budget_items · expenses · packing_items · bookings
                      saved_places · trip_shares · ai_generations · provider_cache
```

Row Level Security is on for every table. Policies are written against
`auth.uid()`, so a trip id arriving from a browser is safe to use directly: if
it belongs to someone else the query returns nothing. Writing a row with a
forged `user_id` fails with `42501` — verified in `npm run test:auth`, not
assumed.

---

## Sign-in

Email and password, through Supabase Auth. Supabase holds the credential — no
password is hashed, stored or compared by this application.

| Route | |
|---|---|
| `/login` | sign in, with links to reset and register |
| `/signup` | full name, email, password; the name reaches the profile through the signup trigger |
| `/forgot-password` | sends a reset link |
| `/reset-password` | sets the new password, then signs out everywhere |
| `/auth/callback` | exchanges an emailed link for a session |

Sessions are read with `getUser()`, never `getSession()`: the latter only
decodes a cookie the browser owns, so it will accept one a user has edited.

See [docs/authentication.md](docs/authentication.md) for the two dashboard
settings production needs.

---

## Travel data

The planner uses real providers, and says where every value came from.

| Provider | For | Key needed |
|---|---|---|
| OSRM | route, distance, driving time, geometry | no |
| Nominatim | turning a place name into coordinates | no |
| Open-Meteo | forecast per day | no |
| Google Places | restaurants, fuel, hotels at each stop | yes, optional |
| Overpass (OpenStreetMap) | the keyless fallback for places | no |

Every value carries its provenance: **verified** with a named source,
**estimated** with its basis stated, or **unavailable**. Nothing is invented —
when a provider cannot answer, the itinerary says so rather than filling the gap.

Overpass is a genuine fallback rather than a recommendation: measured against a
636 km route, the public mirrors timed out at 70 seconds on an eight-point
query. Set `GOOGLE_PLACES_API_KEY` for places that actually resolve.

---

### Vehicle and fuel

Fuel is costed per route segment from the vehicle, the terrain and the load,
not from a flat rate. A mountain leg returns noticeably fewer km/l than a
highway one, which is the difference between a usable budget and an
optimistic one on a hill route.

Every figure is an **estimate** and is typed as one. Catalogue mileage is a
conservative real-world number, deliberately not the manufacturer claim, and a
mileage the user enters themselves overrides it. No live fuel-price feed is
connected, so the price is a stated assumption the user can replace — quoting
a stale number as today's price would be the fabrication this codebase avoids
everywhere else.

## Environment variables

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=      # server only; bypasses RLS
GOOGLE_PLACES_API_KEY=          # optional; without it places degrade honestly
```

Only the two `NEXT_PUBLIC_` values reach the browser, by design: the publishable
key is meant to be public and RLS is what protects the data. The service-role
key lives in `lib/supabase/server.ts`, which is marked `server-only`, so
importing it from a client component fails the build rather than shipping a
secret.

`.env.local` is gitignored and must stay that way.

---

## Running it

```sh
npm install
npm run dev
```

The planner is generated from the design file before every build. Do not edit
`prototype-build/` by hand — `prebuild` overwrites it.

---

## Verifying

```sh
npm run typecheck
npm run build
npm run test:auth         # 29 checks: sign-in, errors, and cross-user isolation
npm run test:persistence  # 14 checks: a trip surviving a fresh sign-in
npm run test:fuel         # 58 checks: vehicle matching, terrain, mileage override
npm run test:plan         # 55 checks: the stop engine, offline
npm run test:browser      # 27 steps through the planner in real Chromium
npm run test:site -- http://127.0.0.1:3400
```

`test:auth` is the one that matters most. It signs in as two real accounts and
tries, as B, to read, edit, delete and attach to A's trip by its UUID. Every
attempt must fail in the database.

---

## Deploying

Vercel, from `main`. `vercel.json` sets the framework preset — without it the
build output is served as a static directory and every route but `/` 404s.

Environment variables are injected at deploy time, so one added after a
deployment does not reach it. Add the variable, then redeploy.

---

## What is not built

No AI provider is wired. Activities inside each day, stays, restaurants and
sightseeing are generated from real places where a provider answers, and left
empty rather than invented where none does.

Also not built: PDF and Excel export, share links in the UI, collaborators,
conflict detection, drag-and-drop reordering, the map, and the AI assistant. The
database and the planning engine they depend on are in place.
