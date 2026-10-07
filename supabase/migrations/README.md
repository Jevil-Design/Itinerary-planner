# Migrations

Applied to the `Itinerary-planner` Supabase project (`tbzywzwzfcvwgmydsiih`).

| # | Name | What it does |
|---|------|--------------|
| 1 | `core_trips_and_itinerary` | `profiles`, `trips`, `trip_days`, `itinerary_items`; the `provenance` enum; RLS on all four; the signup trigger that creates a profile. |
| 2 | `budget_expenses_packing_sharing` | `budget_items`, `expenses`, `packing_items`, `bookings`, `saved_places`, `trip_shares`, `ai_generations`, `provider_cache`; RLS on all. |
| 3 | `shared_trip_read_access` | `trip_by_share_token()` — one security-definer function that is the only way to read a trip without owning it. |
| 4 | `lock_down_trigger_functions` | Revokes `EXECUTE` on the trigger functions, which PostgREST would otherwise expose as RPC endpoints. |

The live definitions can be dumped with `supabase db pull` once the CLI is
linked. They are listed here because the schema was applied through the
management API, not from files on disk.

## The two rules the schema enforces

**Ownership lives in the database.** Every policy is written against
`auth.uid()`. A trip id arriving from a browser is safe to use directly: if it
belongs to someone else the query returns nothing. Writing a row with a forged
`user_id` fails with `42501` — verified, not assumed.

**Provenance is a column, not a convention.** `itinerary_items.provenance` and
`budget_items.provenance` are `not null`, so a row cannot be stored without
declaring whether a provider said it or the engine guessed it.

## Deliberately without a policy

`provider_cache` has RLS enabled and no policy at all. It is server-only state,
keyed by route rather than by user, and denying `anon` and `authenticated`
outright is the intent — not an oversight.
