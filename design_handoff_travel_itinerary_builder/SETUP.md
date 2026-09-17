# Contour — AI Travel Itinerary Builder

Give it a source, a destination and dates. It builds, optimizes, saves and manages the whole trip — route, day-by-day schedule, stays, food, sightseeing, weather, budget, expenses, packing list — and keeps it in the cloud so it is there on every device.

**Supabase PostgreSQL is the single source of truth.** No trip data lives in `localStorage`, `sessionStorage`, `IndexedDB` or a static file.

---

## What is in this repository

| Path | What it is |
|---|---|
| `Contour — AI Travel Itinerary Builder.dc.html` | The complete UI design, as a working interactive prototype. Every screen, state and interaction the product needs. Open it in a browser. |
| `database/schema.sql` | Production PostgreSQL schema: 14 tables, constraints, indexes, `updated_at` triggers, the signup hook, all RLS policies, the transactional generate function, and the redacted share-read function. |
| `database/seed.sql` | Optional demo trip, clearly marked as test data. |
| `docs/api-contract.md` | Every API route: method, path, auth, request body, response shape, error codes. |
| `docs/service-interfaces.md` | The provider-agnostic service layer (AI, routing, places, weather, hotels) so any provider can be swapped without touching a route handler. |
| `.env.example` | Every variable the app reads, with a note on which ones are server-only. |

### Reading the prototype as a spec

The prototype's data layer is shaped exactly like `schema.sql` — same tables, same column names, same relationships — and every mutation goes through a single `save()` service call. Replacing that one function with Supabase client calls is what turns the prototype into the app. The prototype is the reference for behaviour; `schema.sql` is the reference for shape.

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

## Setup

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
