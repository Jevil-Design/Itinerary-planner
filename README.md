# Contour — AI Travel Itinerary Builder

Give it a source, a destination and dates. It builds, optimizes, saves and manages the whole trip — route, day-by-day schedule, stays, food, sightseeing, weather, budget, expenses, packing list — and keeps it in the cloud so it is there on every device.

**Supabase PostgreSQL is the single source of truth.** No trip data lives in `localStorage`, `sessionStorage`, `IndexedDB` or a static file.

---

## What is in this repository

| Path | What it is |
|---|---|
| `Contour — AI Travel Itinerary Builder.dc.html` | The complete UI design, as a working interactive prototype. Every screen, state and interaction the product needs. Open it in a browser. |
| `support.js` | The runtime the prototype needs, beside the `.dc.html` so it opens straight from disk. |
| `public/prototype/` | The prototype and its runtime as served, at **/prototype**. Next.js owns `/` now, so the prototype lives here as the behavioural reference. Re-copy `index.html` from the `.dc.html` if you regenerate the design. |
| `app/`, `lib/`, `stack.ts` | The real application — see *The application* below. |
| `scripts/verify-persistence.mjs` | Proves the storage contract against the live database, inside a rolled-back transaction. |
| `database/schema.sql` | Production PostgreSQL schema: 14 tables, constraints, indexes, `updated_at` triggers, the signup hook, all RLS policies, the transactional generate function, and the redacted share-read function. |
| `database/schema.neon.sql` | The same schema ported to **Neon** (Neon Auth + Neon RLS). This is what is actually deployed — see *Setup — Neon* below. |
| `database/seed.sql` | Optional demo trip, clearly marked as test data. |
| `docs/api-contract.md` | Every API route: method, path, auth, request body, response shape, error codes. |
| `docs/service-interfaces.md` | The provider-agnostic service layer (AI, routing, places, weather, hotels) so any provider can be swapped without touching a route handler. |
| `.env.example` | Every variable the app reads, with a note on which ones are server-only. |

### Reading the prototype as a spec

The prototype's data layer is shaped exactly like `schema.sql` — same tables, same column names, same relationships — and every mutation goes through a single `save()` service call. Replacing that one function with Supabase client calls is what turns the prototype into the app. The prototype is the reference for behaviour; `schema.sql` is the reference for shape.

---

## The application

The prototype is the spec; this is the implementation. It is deliberately a thin
vertical slice — sign in, create a trip, see it persist — rather than a broad
surface that has never touched the database.

    app/
      layout.tsx                  Stack provider, fonts, metadata
      page.tsx                    landing, session aware
      handler/[...stack]/         sign-in, sign-up, reset, OAuth callbacks
      (app)/layout.tsx            auth guard for every screen beneath it
      (app)/trips/                list + empty state
      (app)/trips/new/            create form
      api/trips/                  GET list, POST create
      api/trips/[id]/             GET one, DELETE
      api/me/                     session probe
    lib/
      db.ts                       two connections: service and RLS-bound
      auth.ts                     session -> user, ensures the profile row
      validation.ts               zod schemas shared by form and route
      http.ts                     { error: { code, message } } envelope
      queries/trips.ts            data layer, every call scoped by userId

### Running it

```bash
cp .env.example .env.local     # fill in DATABASE_URL and the Stack keys
npm install
npm run dev
```

`STACK_SECRET_SERVER_KEY` is not available through the Neon API. Copy it from the
Neon Console: **Auth → Configuration → Stack Auth keys → Secret server key**.
Without it there is no session and every protected route answers 401.

Email/password sign-in is **off** by default on a fresh Neon Auth project; only
shared OAuth is enabled. Turn it on in the same Console screen if you want it.

### Google sign-in

Stack Auth serves the whole flow at `/handler/sign-in` — the Google button, the
redirect to Google, the callback, and the session cookie. There is nothing to
implement; it needs configuration.

**Already done.** Google is enabled on the Neon Auth project, and
`https://itinerary-planner-virid.vercel.app` is in the redirect whitelist.
`localhost` is allowed by default, so `npm run dev` works without extra setup.

**Still needed for it to run at all:** `STACK_SECRET_SERVER_KEY`, which the Neon
API does not expose. Without it the server cannot validate a session and every
protected route answers 401.

**Still needed for production:** Google is currently a **shared** provider —
Stack's own OAuth client. It works, but the consent screen says Stack rather
than Contour and it is rate limited. To use your own:

1. Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID
   → Web application.
2. Authorised redirect URI:
   `https://api.stack-auth.com/api/v1/auth/oauth/callback/google`
3. Put the client ID and secret into Neon Console → Auth → Configuration →
   Google, switching the provider from *shared* to *standard*.

Add every new deployment origin to the trusted domain list, or its callback will
be rejected.

### Deploying

`vercel.json` pins `framework: nextjs`. Do not remove it. The project was
created as a static site, so its preset was `null`; Vercel still ran
`next build` and reported success, then served the output as a plain directory.
Static files resolved and every server route 404d — `/prototype` worked while
`/` did not, which looks like a routing bug and is not one.

Vercel also blocks deployment of Next.js versions carrying a critical advisory,
*after* a successful build. The log ends `Build Completed` followed by
`Vulnerable version of Next.js detected` and the deployment goes red. Keep Next
current; `npm audit` before wondering why a green build will not go live.

Auth is optional at build time. `stack.ts` constructs `StackServerApp` lazily,
so a deployment without `STACK_SECRET_SERVER_KEY` still builds and serves —
the landing page, the prototype and the API all work, and `/handler/*` renders
an honest "sign-in is not set up yet" page instead of crashing. Add the key to
turn accounts on.

### Two connections, on purpose

`DATABASE_URL` authenticates as `neondb_owner`, which owns the tables and so
**bypasses RLS**. It is the service path, and it is why every function in
`lib/queries` takes a `userId` and scopes on it — there is deliberately no
"get any trip by id".

`DATABASE_AUTHENTICATED_URL` connects as `authenticated` carrying the user's JWT,
so RLS binds and a forgotten `WHERE` clause still returns nothing that is not
theirs. Defence in depth, not the primary gate.

### Verifying it

```bash
node scripts/verify-persistence.mjs                        # 17 checks, live database
node --experimental-strip-types scripts/verify-itinerary-e2e.mjs   # 16, real planner
node scripts/verify-generate.mjs                           # 12, atomic write
npm run test:browser                                       # 27, real Chromium
npm run typecheck && npm run build
```

`npm run build` runs `build:prototype` first, which regenerates
`public/prototype/` from the design file. Do not hand-edit anything under
`public/prototype/` — it is generated, and the build will overwrite it.

The browser test drives a real Chromium through sign-up, the wizard, generation
and every screen, then checks all nine viewport widths for horizontal overflow
and watches the console. It catches what the unit suites cannot: an SVG
attribute error, a script that fails to load, a nav that will not wrap.

The persistence script writes two users and their trips, asserts neither can see
or delete the other's, checks the CHECK constraints and the cascade, then rolls
the whole transaction back.

---

## Architecture

```
Browser (React / Next.js client components)
   │  fetch('/api/...')          ← never calls an external API directly
   ▼
Next.js API routes  (app/api/**/route.ts)
   │  ├── lib/services/ai         AI provider behind one interface
   │  ├── lib/services/routing    distances, durations, polylines
   │  ├── lib/services/places     attractions, restaurants, fuel, parking
   │  ├── lib/services/weather    forecast + alerts
   │  └── lib/services/cache      reads/writes public.api_cache
   ▼
Supabase  (PostgreSQL + Auth + Storage, all behind RLS)
```

Two rules that the whole design depends on:

1. **No private key ever reaches the browser.** Only `NEXT_PUBLIC_*` variables are client-visible. Every keyed call happens in a route handler.
2. **Every recommendation carries its source.** Rows have a `verified` boolean. `true` means a live API response backs it. `false` means the model estimated it, and the UI must render `✦ AI Recommendation — Verify Before Booking`. Hotel names, prices, ratings, opening hours, train and flight schedules, weather and distances are never presented as fact without a live source.

### Suggested file layout

```
app/
  (marketing)/page.tsx            landing
  (auth)/login, signup, reset
  (app)/dashboard, trips, trips/new, trips/[id]/...
  share/[token]/page.tsx          public read-only itinerary
  api/                            see docs/api-contract.md
components/                       UI, built from the prototype
lib/
  supabase/{client,server,middleware}.ts
  services/{ai,routing,places,weather,hotels,cache}/
  itinerary/{schedule,optimize,budget,packing,fuel}.ts
  validation/schemas.ts           zod, shared by client and server
types/database.ts                 generated from the schema
database/{schema.sql,seed.sql}
```

---

## Setup — Neon  (this is the one that is live)

A Neon project is already provisioned and the schema is applied:

| | |
|---|---|
| Project | `Contour-Itinerary-Planner` (`lively-forest-21234465`) |
| Region | `aws-ap-southeast-1` (Singapore — nearest to the Vercel `bom1` deploy) |
| Postgres | 17 |
| Auth | Neon Auth (Stack), synced into `neon_auth.users_sync` |

### 1. Apply or re-apply the schema

`database/schema.neon.sql` is idempotent — re-running it is safe.

```bash
psql "$DATABASE_URL_UNPOOLED" -f database/schema.neon.sql
```

### 2. What changed from the Supabase version

Tables, columns, constraints, indexes and functions are identical. Only identity
plumbing differs:

| Supabase | Neon |
|---|---|
| `auth.users` | `neon_auth.users_sync` |
| `auth.uid()` → `uuid` | `public.current_user_id()` → `text` |
| `profiles.id`, `trips.user_id`, `saved_places.user_id` as `uuid` | `text` |
| role `anon` | role `anonymous` |
| signup trigger on `auth.users` | trigger on `neon_auth.users_sync` |

User ids are `text` because `neon_auth.users_sync.id` is `text` (Stack Auth ids).
Every other `uuid` is unchanged.

`public.current_user_id()` exists because `pg_session_jwt` installs
`auth.user_id()` into a schema owned by Neon's `cloud_admin`. The `authenticated`
role cannot reach it, and `neondb_owner` cannot grant what it does not hold with
grant option — so `GRANT USAGE ON SCHEMA auth` silently does nothing. A policy
written as `user_id = auth.user_id()` therefore raises `42501 permission denied
for schema auth` instead of filtering. The wrapper is `SECURITY DEFINER` with an
empty `search_path`, and every policy goes through it.

### 3. Who bypasses RLS

`neondb_owner` **owns** these tables, so like any Postgres table owner it bypasses
row level security. That is the server-side/service path, and it is what
`DATABASE_URL` points at.

For RLS to actually bind, connect as `authenticated` carrying the user's JWT:

```ts
import { neon } from '@neondatabase/serverless'
const sql = neon(process.env.DATABASE_AUTHENTICATED_URL!, { authToken })
```

Without a JWT, `current_user_id()` is `null` and every policy denies.

### 4. Two deliberate deviations from `schema.sql`

1. `admin_overview` is created `WITH (security_invoker = true)`. The original
   carried a comment claiming RLS still applied to it, but a Postgres view runs
   as its **owner** unless that option is set — so on the original the view
   bypassed RLS. Setting it makes the comment true.
2. The signup hook fires on `neon_auth.users_sync`, which Neon populates by
   **sync** rather than inside the signup transaction. A profile row appears
   shortly after signup, not atomically with it. Call `public.ensure_profile()`
   from the first authenticated request when it has to exist immediately.

### 5. Verifying RLS

`set role authenticated` needs role membership, which is not granted by the
schema. Grant it once if you want to test by hand:

```sql
grant authenticated to neondb_owner;
```

Then, inside a transaction you roll back, stub the identity function to
impersonate a user — DDL is transactional in Postgres, so nothing persists:

```sql
begin;
create or replace function public.current_user_id() returns text
  language sql stable security definer set search_path = ''
  as $$ select 'the-user-id'::text $$;
set local role authenticated;
select count(*) from trips;          -- only that user's trips
rollback;                            -- function and role both restored
```

---

## Setup — Supabase  (the original target, kept for reference)

### 1. Create the Supabase project

[database.new](https://database.new) → new project → pick a region close to your users → save the database password.

### 2. Run the schema

Supabase Dashboard → **SQL Editor** → paste the whole of `database/schema.sql` → **Run**.

It is idempotent, so re-running it after an edit is safe.

Verify: **Table Editor** should show 14 tables, and every one should show the *RLS enabled* badge. `api_cache` should have **zero** policies — that is deliberate, it makes the table service-role-only.

### 3. Enable email authentication

**Authentication → Providers → Email**: enabled, with *Confirm email* on for production.

**Authentication → URL Configuration**:
- Site URL: `http://localhost:3000` (and your production URL once deployed)
- Redirect URLs: `http://localhost:3000/auth/callback`, `https://your-domain.com/auth/callback`

### 4. Enable Google authentication

1. Google Cloud Console → **APIs & Services → Credentials → Create OAuth client ID → Web application**.
2. Authorised redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`
3. Copy the client ID and secret into Supabase → **Authentication → Providers → Google**.
4. Add `http://localhost:3000/auth/callback` and your production callback to the app's redirect URL list (step 3).

The `on_auth_user_created` trigger in `schema.sql` inserts the `profiles` row automatically, for email and Google signups alike — no client-side profile creation.

### 5. Confirm RLS actually holds

Worth doing once, by hand, before you trust it:

```sql
-- as user A, in the SQL editor with "run as" set to authenticated + A's uid
select count(*) from trips;                 -- only A's trips
select count(*) from expenses;              -- only A's expenses
update trips set trip_name = 'x' where user_id <> auth.uid();  -- 0 rows
```

### 6. Environment variables

```bash
cp .env.example .env.local
```

Fill in the Supabase URL and anon key from **Project Settings → API**, the service role key from the same page, and the provider keys you have. Missing provider keys are not fatal — see *Degradation* below.

### 7. Generate the types

```bash
npx supabase gen types typescript --project-id <project-ref> > types/database.ts
```

### 8. Run it

```bash
npm install
npm run dev
```

### 9. The cloud test

This is the one that matters, and it is not optional:

1. Sign up in browser A. Create a trip. Generate it. Edit a day.
2. Log out.
3. Open browser B (or a private window on another device). Log in with the same account.
4. The trip, the edit, the expenses and the packing state must all be there.

If anything is missing, something is still reading from browser storage.

### 10. Seed data (optional)

`database/seed.sql` inserts one demo trip. Every row it writes is tagged `[DEMO]` in its description so it can never be mistaken for a user's real trip. Run it only against a development project, and pass your own user id:

```sql
\set demo_user_id '00000000-0000-0000-0000-000000000000'
\i database/seed.sql
```

---

## Deployment — Vercel + Supabase

1. Push to GitHub. `.gitignore` must contain `.env*.local` — confirm before the first push.
2. Vercel → **New Project** → import the repo.
3. **Settings → Environment Variables**: add every variable from `.env.example` for *Production* and *Preview*. Set `NEXT_PUBLIC_SITE_URL` to the real domain.
4. Deploy.
5. Back in Supabase → **Authentication → URL Configuration**: add the production Site URL and `https://your-domain.com/auth/callback`. Add the Vercel preview pattern too if you use preview auth.
6. Google Cloud Console → add the production callback to the OAuth client.
7. Re-run the step-9 cloud test against production.

Recommended after launch: point a `pg_cron` job at `public.purge_api_cache()` every 30 minutes, enable Supabase daily backups, and set a spend cap in each API provider's console.

---

## Degradation — when a provider is missing or down

Nothing hard-fails. Each service returns a discriminated result and the UI adapts:

| Missing | Behaviour |
|---|---|
| Routing API | Distances and durations become AI estimates, `verified = false`. The map shows a schematic waypoint projection, labelled as such, plus an *Open route in Maps* deep link. |
| Weather API | Falls back to climate normals for the dates and locations, labelled *climate normals, not a live forecast*. |
| Places API | Attractions and restaurants become AI suggestions by area and price band, `verified = false`. |
| Hotels API | Price bands and areas to search, never listings. Always `✦ AI Recommendation — Verify Before Booking`. |
| AI provider | Generation returns `503` with a retry. No partial trip is written — `save_generated_trip` is one transaction. |

---

## Error handling

Every route returns `{ error: { code, message } }` with a real status. The client renders the message; nothing fails silently.

`ROUTE_UNAVAILABLE` · `HOTELS_UNAVAILABLE` · `WEATHER_UNAVAILABLE` · `GENERATION_FAILED` · `SAVE_FAILED` · `AUTH_FAILED` · `VALIDATION_FAILED` · `RATE_LIMITED` · `NOT_FOUND` · `FORBIDDEN`

---

## Validation

`lib/validation/schemas.ts` holds one zod schema per payload, imported by both the form and the route handler so the rules cannot drift:

- source and destination non-empty, ≤ 160 characters
- `end_date >= start_date`; trip length ≤ 365 days
- travellers between 1 and 40
- `budget_amount > 0` when `budget_type = 'Custom'`
- `travel_mode` and `trip_type` within the allowed sets

The same rules exist as `CHECK` constraints in `schema.sql`, so an invalid row cannot be written even by a direct database call.
