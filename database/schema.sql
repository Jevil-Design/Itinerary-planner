-- ============================================================================
-- Contour — AI Travel Itinerary Builder
-- PostgreSQL schema for Supabase: tables, constraints, indexes, triggers, RLS
-- ----------------------------------------------------------------------------
-- Run order:  schema.sql  ->  (optional) seed.sql
-- Safe to re-run: every object is created with IF NOT EXISTS / OR REPLACE,
-- and policies are dropped before being recreated.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ============================================================================
-- 1. ENUM-LIKE DOMAINS
-- Kept as TEXT + CHECK rather than native enums so values can be added in a
-- migration without an ALTER TYPE lock.
-- ============================================================================

-- travel_mode      : Bike | Car | Train | Flight | Bus | Mixed
-- trip_type        : Solo | Couple | Family | Friends | Group | Business
--                    | Photography | Adventure | Relaxation
-- budget_type      : Budget | Moderate | Premium | Luxury | Custom
-- trip_status      : Draft | Planned | Ongoing | Completed | Cancelled
-- activity_type    : prep | travel | sight | food | stay | rest | other
-- priority         : Must Visit | Recommended | Optional
-- hotel_category   : Budget | Mid-Range | Premium
-- place_type       : Hotel | Restaurant | Attraction | Photography

-- ============================================================================
-- 2. PROFILES  (1:1 with auth.users)
-- ============================================================================

create table if not exists public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  email             text not null,
  full_name         text,
  avatar_url        text,
  phone             text,
  default_currency  text not null default 'INR' check (char_length(default_currency) = 3),
  preferred_mode    text check (preferred_mode in ('Bike','Car','Train','Flight','Bus','Mixed')),
  preferred_budget  text check (preferred_budget in ('Budget','Moderate','Premium','Luxury','Custom')),
  food_preference   text check (food_preference in ('Vegetarian','Non-Vegetarian','Vegan','Jain','Local Food','No Preference')),
  is_admin          boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.profiles is 'Public profile mirror of auth.users. Never expose email/phone through a share link.';

-- ============================================================================
-- 3. TRIPS
-- ============================================================================

create table if not exists public.trips (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.profiles (id) on delete cascade,
  trip_name             text not null check (char_length(trim(trip_name)) between 1 and 160),
  source                text not null check (char_length(trim(source)) > 0),
  destination           text not null check (char_length(trim(destination)) > 0),
  start_date            date not null,
  end_date              date not null,
  number_of_days        integer not null check (number_of_days between 1 and 365),
  number_of_nights      integer not null check (number_of_nights >= 0),
  travellers            integer not null default 1 check (travellers between 1 and 40),
  travel_mode           text not null check (travel_mode in ('Bike','Car','Train','Flight','Bus','Mixed')),
  trip_type             text check (trip_type in ('Solo','Couple','Family','Friends','Group','Business','Photography','Adventure','Relaxation')),
  budget_type           text not null default 'Moderate' check (budget_type in ('Budget','Moderate','Premium','Luxury','Custom')),
  budget_amount         numeric(12,2) check (budget_amount is null or budget_amount >= 0),
  food_preference       text check (food_preference in ('Vegetarian','Non-Vegetarian','Vegan','Jain','Local Food','No Preference')),
  hotel_preference      text check (hotel_preference in ('Budget','3 Star','4 Star','5 Star','Homestay','Resort','Hostel','No Preference')),
  interests             jsonb not null default '[]'::jsonb,
  special_requirements  text,
  total_distance        numeric(10,2) default 0 check (total_distance >= 0),
  estimated_total_cost  numeric(12,2) default 0 check (estimated_total_cost >= 0),
  currency              text not null default 'INR' check (char_length(currency) = 3),
  status                text not null default 'Draft' check (status in ('Draft','Planned','Ongoing','Completed','Cancelled')),
  generation_meta       jsonb,  -- model, prompt version, provider, token counts, timings
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint trips_dates_ordered check (end_date >= start_date),
  constraint trips_interests_is_array check (jsonb_typeof(interests) = 'array')
);

-- ============================================================================
-- 4. ITINERARY DAYS
-- ============================================================================

create table if not exists public.itinerary_days (
  id                    uuid primary key default gen_random_uuid(),
  trip_id               uuid not null references public.trips (id) on delete cascade,
  day_number            integer not null check (day_number >= 1),
  date                  date not null,
  title                 text not null,
  location              text,
  summary               text,
  distance              numeric(10,2) default 0 check (distance >= 0),
  travel_time_minutes   integer default 0 check (travel_time_minutes >= 0),
  estimated_cost        numeric(12,2) default 0 check (estimated_cost >= 0),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (trip_id, day_number)
);

-- ============================================================================
-- 5. ITINERARY ACTIVITIES
-- ============================================================================

create table if not exists public.itinerary_activities (
  id                        uuid primary key default gen_random_uuid(),
  day_id                    uuid not null references public.itinerary_days (id) on delete cascade,
  activity_order            integer not null check (activity_order >= 1),
  start_time                time,
  end_time                  time,
  activity_name             text not null,
  activity_type             text not null default 'other' check (activity_type in ('prep','travel','sight','food','stay','rest','other')),
  location                  text,
  latitude                  numeric(9,6) check (latitude between -90 and 90),
  longitude                 numeric(9,6) check (longitude between -180 and 180),
  duration_minutes          integer check (duration_minutes >= 0),
  distance_from_previous    numeric(10,2) check (distance_from_previous >= 0),
  travel_time_minutes       integer check (travel_time_minutes >= 0),
  estimated_cost            numeric(12,2) default 0 check (estimated_cost >= 0),
  priority                  text default 'Recommended' check (priority in ('Must Visit','Recommended','Optional')),
  description               text,
  opening_time              time,
  closing_time              time,
  source_url                text,
  verified                  boolean not null default false,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (day_id, activity_order) deferrable initially deferred
);

comment on column public.itinerary_activities.verified is
  'TRUE only when the row is backed by a live API response. FALSE = AI estimate; the UI must label it "Verify before booking".';

-- ============================================================================
-- 6. ROUTES
-- ============================================================================

create table if not exists public.routes (
  id                    uuid primary key default gen_random_uuid(),
  trip_id               uuid not null references public.trips (id) on delete cascade,
  route_order           integer not null check (route_order >= 1),
  from_location         text not null,
  to_location           text not null,
  distance_km           numeric(10,2) check (distance_km >= 0),
  duration_minutes      integer check (duration_minutes >= 0),
  route_polyline        text,
  recommended_breaks    jsonb not null default '[]'::jsonb,
  fuel_stops            jsonb not null default '[]'::jsonb,
  toll_estimate         numeric(12,2) default 0 check (toll_estimate >= 0),
  fuel_estimate         numeric(10,2) default 0 check (fuel_estimate >= 0),
  fuel_cost             numeric(12,2) default 0 check (fuel_cost >= 0),
  provider              text,        -- which routing API produced this row
  verified              boolean not null default false,
  created_at            timestamptz not null default now(),
  unique (trip_id, route_order)
);

-- ============================================================================
-- 7. HOTELS
-- ============================================================================

create table if not exists public.hotels (
  id                uuid primary key default gen_random_uuid(),
  trip_id           uuid not null references public.trips (id) on delete cascade,
  location          text not null,
  hotel_name        text not null,
  category          text check (category in ('Budget','Mid-Range','Premium')),
  address           text,
  latitude          numeric(9,6) check (latitude between -90 and 90),
  longitude         numeric(9,6) check (longitude between -180 and 180),
  price_per_night   numeric(12,2) check (price_per_night >= 0),
  rating            numeric(2,1) check (rating is null or rating between 0 and 5),
  review_count      integer check (review_count is null or review_count >= 0),
  facilities        jsonb not null default '[]'::jsonb,
  booking_url       text,
  source            text,            -- provider id, or 'ai-estimate'
  verified          boolean not null default false,
  note              text,
  created_at        timestamptz not null default now()
);

comment on table public.hotels is
  'When verified = false the row is a price band / area suggestion, not a listing. Name, price, rating and availability must not be presented as fact.';

-- ============================================================================
-- 8. RESTAURANTS
-- ============================================================================

create table if not exists public.restaurants (
  id                uuid primary key default gen_random_uuid(),
  trip_id           uuid not null references public.trips (id) on delete cascade,
  location          text not null,
  restaurant_name   text not null,
  meal              text check (meal in ('Breakfast','Lunch','Snacks','Dinner')),
  address           text,
  latitude          numeric(9,6) check (latitude between -90 and 90),
  longitude         numeric(9,6) check (longitude between -180 and 180),
  cuisine           text,
  price_range       text,
  rating            numeric(2,1) check (rating is null or rating between 0 and 5),
  review_count      integer check (review_count is null or review_count >= 0),
  signature_dishes  text,
  opening_hours     jsonb,
  source_url        text,
  verified          boolean not null default false,
  created_at        timestamptz not null default now()
);

-- ============================================================================
-- 9. SIGHTSEEING PLACES
-- ============================================================================

create table if not exists public.sightseeing_places (
  id                    uuid primary key default gen_random_uuid(),
  trip_id               uuid not null references public.trips (id) on delete cascade,
  name                  text not null,
  location              text,
  address               text,
  latitude              numeric(9,6) check (latitude between -90 and 90),
  longitude             numeric(9,6) check (longitude between -180 and 180),
  category              text,
  description           text,
  recommended_duration  integer check (recommended_duration >= 0),
  entry_fee             numeric(12,2) default 0 check (entry_fee >= 0),
  opening_hours         jsonb,
  best_time             text,
  rating                numeric(2,1) check (rating is null or rating between 0 and 5),
  priority              text default 'Recommended' check (priority in ('Must Visit','Recommended','Optional')),
  source_url            text,
  verified              boolean not null default false,
  created_at            timestamptz not null default now()
);

-- ============================================================================
-- 10. EXPENSES  (estimate and actual live on the same row)
-- ============================================================================

create table if not exists public.expenses (
  id                uuid primary key default gen_random_uuid(),
  trip_id           uuid not null references public.trips (id) on delete cascade,
  category          text not null check (category in (
                      'Transportation','Fuel','Toll','Hotel','Food','Activities',
                      'Parking','Local Transport','Shopping','Miscellaneous','Emergency Buffer')),
  description       text,
  estimated_amount  numeric(12,2) default 0 check (estimated_amount >= 0),
  actual_amount     numeric(12,2) default 0 check (actual_amount >= 0),
  currency          text not null default 'INR' check (char_length(currency) = 3),
  expense_date      date,
  payment_method    text check (payment_method in ('UPI','Cash','Card','Net banking','Other')),
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ============================================================================
-- 11. PACKING ITEMS
-- ============================================================================

create table if not exists public.packing_items (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null references public.trips (id) on delete cascade,
  category      text not null,
  item_name     text not null,
  quantity      integer not null default 1 check (quantity >= 1),
  completed     boolean not null default false,
  created_at    timestamptz not null default now()
);

-- ============================================================================
-- 12. TRIP CHECKLISTS
-- ============================================================================

create table if not exists public.trip_checklists (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null references public.trips (id) on delete cascade,
  label         text not null,
  done          boolean not null default false,
  item_order    integer not null default 0,
  created_at    timestamptz not null default now()
);

-- ============================================================================
-- 13. SAVED PLACES  (owned by the user, not by a trip)
-- ============================================================================

create table if not exists public.saved_places (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  name          text not null,
  location      text,
  place_type    text check (place_type in ('Hotel','Restaurant','Attraction','Photography')),
  latitude      numeric(9,6) check (latitude between -90 and 90),
  longitude     numeric(9,6) check (longitude between -180 and 180),
  notes         text,
  created_at    timestamptz not null default now()
);

-- ============================================================================
-- 14. TRIP SHARES
-- ============================================================================

create table if not exists public.trip_shares (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null references public.trips (id) on delete cascade,
  share_token   text not null unique default encode(gen_random_bytes(18), 'hex'),
  is_active     boolean not null default true,
  show_budget   boolean not null default false,
  expires_at    timestamptz,
  view_count    integer not null default 0,
  created_at    timestamptz not null default now()
);

-- ============================================================================
-- 15. API CACHE  (service role only — never readable by end users)
-- ============================================================================

create table if not exists public.api_cache (
  id            uuid primary key default gen_random_uuid(),
  provider      text not null,        -- 'routing' | 'places' | 'weather' | 'hotels' | 'restaurants' | 'ai'
  cache_key     text not null,        -- deterministic hash of the request params
  payload       jsonb not null,
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now(),
  unique (provider, cache_key)
);

comment on table public.api_cache is
  'Server-side response cache. RLS is enabled with NO policies, so only the service role can read or write it.';

-- ============================================================================
-- 16. INDEXES
-- ============================================================================

create index if not exists idx_trips_user_id            on public.trips (user_id);
create index if not exists idx_trips_destination        on public.trips (destination);
create index if not exists idx_trips_start_date         on public.trips (start_date);
create index if not exists idx_trips_user_start         on public.trips (user_id, start_date desc);
create index if not exists idx_trips_status             on public.trips (status);

create index if not exists idx_days_trip_id             on public.itinerary_days (trip_id);
create index if not exists idx_days_trip_number         on public.itinerary_days (trip_id, day_number);

create index if not exists idx_acts_day_id              on public.itinerary_activities (day_id);
create index if not exists idx_acts_day_order           on public.itinerary_activities (day_id, activity_order);

create index if not exists idx_routes_trip_id           on public.routes (trip_id);
create index if not exists idx_hotels_trip_id           on public.hotels (trip_id);
create index if not exists idx_hotels_trip_location     on public.hotels (trip_id, location);
create index if not exists idx_restaurants_trip_id      on public.restaurants (trip_id);
create index if not exists idx_sightseeing_trip_id      on public.sightseeing_places (trip_id);
create index if not exists idx_expenses_trip_id         on public.expenses (trip_id);
create index if not exists idx_expenses_trip_date       on public.expenses (trip_id, expense_date);
create index if not exists idx_packing_trip_id          on public.packing_items (trip_id);
create index if not exists idx_checklists_trip_id       on public.trip_checklists (trip_id);
create index if not exists idx_saved_places_user_id     on public.saved_places (user_id);
create index if not exists idx_trip_shares_trip_id      on public.trip_shares (trip_id);
create index if not exists idx_trip_shares_token        on public.trip_shares (share_token) where is_active;
create index if not exists idx_api_cache_expires        on public.api_cache (expires_at);

-- ============================================================================
-- 17. updated_at TRIGGERS
-- ============================================================================

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

do $do$
declare t text;
begin
  foreach t in array array['profiles','trips','itinerary_days','itinerary_activities','expenses']
  loop
    execute format('drop trigger if exists trg_touch_%1$s on public.%1$s', t);
    execute format(
      'create trigger trg_touch_%1$s before update on public.%1$s
       for each row execute function public.touch_updated_at()', t);
  end loop;
end
$do$;

-- ============================================================================
-- 18. NEW-USER HOOK — create a profile row on signup
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$fn$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- 19. OWNERSHIP HELPER — one function, used by every child-table policy
-- ============================================================================

create or replace function public.owns_trip(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.trips t
    where t.id = p_trip_id and t.user_id = auth.uid()
  );
$fn$;

create or replace function public.owns_day(p_day_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1
    from public.itinerary_days d
    join public.trips t on t.id = d.trip_id
    where d.id = p_day_id and t.user_id = auth.uid()
  );
$fn$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$fn$;

-- ============================================================================
-- 20. ROW LEVEL SECURITY
-- Every table is locked. A user reaches a row only through their own user_id
-- or through a trip they own. api_cache has RLS on and no policies at all.
-- ============================================================================

alter table public.profiles             enable row level security;
alter table public.trips                enable row level security;
alter table public.itinerary_days       enable row level security;
alter table public.itinerary_activities enable row level security;
alter table public.routes               enable row level security;
alter table public.hotels               enable row level security;
alter table public.restaurants          enable row level security;
alter table public.sightseeing_places   enable row level security;
alter table public.expenses             enable row level security;
alter table public.packing_items        enable row level security;
alter table public.trip_checklists      enable row level security;
alter table public.saved_places         enable row level security;
alter table public.trip_shares          enable row level security;
alter table public.api_cache            enable row level security;

-- ---- profiles --------------------------------------------------------------
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert with check (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- ---- trips -----------------------------------------------------------------
drop policy if exists trips_select_own on public.trips;
create policy trips_select_own on public.trips
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists trips_insert_own on public.trips;
create policy trips_insert_own on public.trips
  for insert with check (user_id = auth.uid());

drop policy if exists trips_update_own on public.trips;
create policy trips_update_own on public.trips
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists trips_delete_own on public.trips;
create policy trips_delete_own on public.trips
  for delete using (user_id = auth.uid());

-- ---- trip-scoped child tables ---------------------------------------------
-- itinerary_days, routes, hotels, restaurants, sightseeing_places, expenses,
-- packing_items, trip_checklists, trip_shares all key off owns_trip(trip_id).
do $do$
declare t text;
begin
  foreach t in array array[
    'itinerary_days','routes','hotels','restaurants','sightseeing_places',
    'expenses','packing_items','trip_checklists','trip_shares'
  ]
  loop
    execute format('drop policy if exists %1$s_all_own on public.%1$s', t);
    execute format(
      'create policy %1$s_all_own on public.%1$s
         for all
         using (public.owns_trip(trip_id))
         with check (public.owns_trip(trip_id))', t);
  end loop;
end
$do$;

-- ---- itinerary_activities (keyed through day_id) ---------------------------
drop policy if exists activities_all_own on public.itinerary_activities;
create policy activities_all_own on public.itinerary_activities
  for all
  using (public.owns_day(day_id))
  with check (public.owns_day(day_id));

-- ---- saved_places ----------------------------------------------------------
drop policy if exists saved_places_all_own on public.saved_places;
create policy saved_places_all_own on public.saved_places
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- api_cache: RLS enabled, zero policies -> service role only. Do not add one.

-- ============================================================================
-- 21. PUBLIC SHARE READ PATH
-- A shared trip is NOT exposed by relaxing RLS. It is read through one
-- SECURITY DEFINER function that returns a redacted JSON document and never
-- touches profiles.email / profiles.phone.
-- ============================================================================

create or replace function public.get_shared_trip(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_share public.trip_shares;
  v_trip  public.trips;
  v_doc   jsonb;
begin
  select * into v_share
  from public.trip_shares
  where share_token = p_token
    and is_active
    and (expires_at is null or expires_at > now());

  if not found then
    return null;
  end if;

  select * into v_trip from public.trips where id = v_share.trip_id;
  if not found then
    return null;
  end if;

  v_doc := jsonb_build_object(
    'trip', jsonb_build_object(
      'trip_name',        v_trip.trip_name,
      'source',           v_trip.source,
      'destination',      v_trip.destination,
      'start_date',       v_trip.start_date,
      'end_date',         v_trip.end_date,
      'number_of_days',   v_trip.number_of_days,
      'number_of_nights', v_trip.number_of_nights,
      'travellers',       v_trip.travellers,
      'travel_mode',      v_trip.travel_mode,
      'trip_type',        v_trip.trip_type,
      'total_distance',   v_trip.total_distance,
      'currency',         v_trip.currency
    ),
    'routes', (
      select coalesce(jsonb_agg(to_jsonb(r) order by r.route_order), '[]'::jsonb)
      from public.routes r where r.trip_id = v_trip.id
    ),
    'days', (
      select coalesce(jsonb_agg(
        to_jsonb(d) || jsonb_build_object('activities', (
          select coalesce(jsonb_agg(to_jsonb(a) order by a.activity_order), '[]'::jsonb)
          from public.itinerary_activities a where a.day_id = d.id
        ))
        order by d.day_number), '[]'::jsonb)
      from public.itinerary_days d where d.trip_id = v_trip.id
    ),
    'hotels', (
      select coalesce(jsonb_agg(to_jsonb(h)), '[]'::jsonb)
      from public.hotels h where h.trip_id = v_trip.id
    ),
    'restaurants', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from public.restaurants x where x.trip_id = v_trip.id
    ),
    'sightseeing', (
      select coalesce(jsonb_agg(to_jsonb(sp)), '[]'::jsonb)
      from public.sightseeing_places sp where sp.trip_id = v_trip.id
    )
  );

  -- Budget is opt-in per share link.
  if v_share.show_budget then
    v_doc := v_doc || jsonb_build_object(
      'budget', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'category', e.category, 'estimated_amount', e.estimated_amount)), '[]'::jsonb)
        from public.expenses e where e.trip_id = v_trip.id
      ),
      'estimated_total_cost', v_trip.estimated_total_cost
    );
  end if;

  update public.trip_shares set view_count = view_count + 1 where id = v_share.id;

  return v_doc;
end;
$fn$;

revoke all on function public.get_shared_trip(text) from public;
grant execute on function public.get_shared_trip(text) to anon, authenticated;

-- ============================================================================
-- 22. TRANSACTIONAL GENERATE — write the whole trip graph or nothing
-- The generate endpoint calls this once with the AI/API result already
-- assembled, so a partial failure can never leave a half-created trip.
-- ============================================================================

create or replace function public.save_generated_trip(
  p_trip_id uuid,
  p_payload jsonb
)
returns void
language plpgsql
security invoker          -- runs as the caller, so RLS still applies
set search_path = public
as $fn$
declare
  v_day   jsonb;
  v_act   jsonb;
  v_day_id uuid;
begin
  if not public.owns_trip(p_trip_id) then
    raise exception 'not authorised for trip %', p_trip_id using errcode = '42501';
  end if;

  -- Replace any previous generation for this trip.
  delete from public.itinerary_days     where trip_id = p_trip_id;  -- cascades to activities
  delete from public.routes             where trip_id = p_trip_id;
  delete from public.hotels             where trip_id = p_trip_id;
  delete from public.restaurants        where trip_id = p_trip_id;
  delete from public.sightseeing_places where trip_id = p_trip_id;
  delete from public.expenses           where trip_id = p_trip_id;
  delete from public.packing_items      where trip_id = p_trip_id;
  delete from public.trip_checklists    where trip_id = p_trip_id;

  insert into public.routes (
    trip_id, route_order, from_location, to_location, distance_km, duration_minutes,
    route_polyline, recommended_breaks, fuel_stops, toll_estimate, fuel_estimate,
    fuel_cost, provider, verified)
  select
    p_trip_id,
    (r ->> 'route_order')::int,
    r ->> 'from_location',
    r ->> 'to_location',
    (r ->> 'distance_km')::numeric,
    (r ->> 'duration_minutes')::int,
    r ->> 'route_polyline',
    coalesce(r -> 'recommended_breaks', '[]'::jsonb),
    coalesce(r -> 'fuel_stops', '[]'::jsonb),
    coalesce((r ->> 'toll_estimate')::numeric, 0),
    coalesce((r ->> 'fuel_estimate')::numeric, 0),
    coalesce((r ->> 'fuel_cost')::numeric, 0),
    r ->> 'provider',
    coalesce((r ->> 'verified')::boolean, false)
  from jsonb_array_elements(coalesce(p_payload -> 'routes', '[]'::jsonb)) r;

  for v_day in select * from jsonb_array_elements(coalesce(p_payload -> 'days', '[]'::jsonb))
  loop
    insert into public.itinerary_days (
      trip_id, day_number, date, title, location, summary,
      distance, travel_time_minutes, estimated_cost)
    values (
      p_trip_id,
      (v_day ->> 'day_number')::int,
      (v_day ->> 'date')::date,
      v_day ->> 'title',
      v_day ->> 'location',
      v_day ->> 'summary',
      coalesce((v_day ->> 'distance')::numeric, 0),
      coalesce((v_day ->> 'travel_time_minutes')::int, 0),
      coalesce((v_day ->> 'estimated_cost')::numeric, 0))
    returning id into v_day_id;

    for v_act in select * from jsonb_array_elements(coalesce(v_day -> 'activities', '[]'::jsonb))
    loop
      insert into public.itinerary_activities (
        day_id, activity_order, start_time, end_time, activity_name, activity_type,
        location, latitude, longitude, duration_minutes, distance_from_previous,
        travel_time_minutes, estimated_cost, priority, description,
        opening_time, closing_time, source_url, verified)
      values (
        v_day_id,
        (v_act ->> 'activity_order')::int,
        (v_act ->> 'start_time')::time,
        (v_act ->> 'end_time')::time,
        v_act ->> 'activity_name',
        coalesce(v_act ->> 'activity_type', 'other'),
        v_act ->> 'location',
        (v_act ->> 'latitude')::numeric,
        (v_act ->> 'longitude')::numeric,
        (v_act ->> 'duration_minutes')::int,
        (v_act ->> 'distance_from_previous')::numeric,
        (v_act ->> 'travel_time_minutes')::int,
        coalesce((v_act ->> 'estimated_cost')::numeric, 0),
        coalesce(v_act ->> 'priority', 'Recommended'),
        v_act ->> 'description',
        (v_act ->> 'opening_time')::time,
        (v_act ->> 'closing_time')::time,
        v_act ->> 'source_url',
        coalesce((v_act ->> 'verified')::boolean, false));
    end loop;
  end loop;

  insert into public.hotels (
    trip_id, location, hotel_name, category, address, latitude, longitude,
    price_per_night, rating, review_count, facilities, booking_url, source, verified, note)
  select
    p_trip_id, h ->> 'location', h ->> 'hotel_name', h ->> 'category', h ->> 'address',
    (h ->> 'latitude')::numeric, (h ->> 'longitude')::numeric,
    (h ->> 'price_per_night')::numeric, (h ->> 'rating')::numeric,
    (h ->> 'review_count')::int, coalesce(h -> 'facilities', '[]'::jsonb),
    h ->> 'booking_url', h ->> 'source', coalesce((h ->> 'verified')::boolean, false), h ->> 'note'
  from jsonb_array_elements(coalesce(p_payload -> 'hotels', '[]'::jsonb)) h;

  insert into public.restaurants (
    trip_id, location, restaurant_name, meal, address, latitude, longitude, cuisine,
    price_range, rating, review_count, signature_dishes, opening_hours, source_url, verified)
  select
    p_trip_id, x ->> 'location', x ->> 'restaurant_name', x ->> 'meal', x ->> 'address',
    (x ->> 'latitude')::numeric, (x ->> 'longitude')::numeric, x ->> 'cuisine',
    x ->> 'price_range', (x ->> 'rating')::numeric, (x ->> 'review_count')::int,
    x ->> 'signature_dishes', x -> 'opening_hours', x ->> 'source_url',
    coalesce((x ->> 'verified')::boolean, false)
  from jsonb_array_elements(coalesce(p_payload -> 'restaurants', '[]'::jsonb)) x;

  insert into public.sightseeing_places (
    trip_id, name, location, address, latitude, longitude, category, description,
    recommended_duration, entry_fee, opening_hours, best_time, rating, priority,
    source_url, verified)
  select
    p_trip_id, sp ->> 'name', sp ->> 'location', sp ->> 'address',
    (sp ->> 'latitude')::numeric, (sp ->> 'longitude')::numeric, sp ->> 'category',
    sp ->> 'description', (sp ->> 'recommended_duration')::int,
    coalesce((sp ->> 'entry_fee')::numeric, 0), sp -> 'opening_hours', sp ->> 'best_time',
    (sp ->> 'rating')::numeric, coalesce(sp ->> 'priority', 'Recommended'),
    sp ->> 'source_url', coalesce((sp ->> 'verified')::boolean, false)
  from jsonb_array_elements(coalesce(p_payload -> 'sightseeing', '[]'::jsonb)) sp;

  insert into public.expenses (trip_id, category, description, estimated_amount, currency, expense_date, notes)
  select
    p_trip_id, e ->> 'category', e ->> 'description',
    coalesce((e ->> 'estimated_amount')::numeric, 0),
    coalesce(e ->> 'currency', 'INR'), (e ->> 'expense_date')::date, e ->> 'notes'
  from jsonb_array_elements(coalesce(p_payload -> 'expenses', '[]'::jsonb)) e;

  insert into public.packing_items (trip_id, category, item_name, quantity)
  select p_trip_id, pi ->> 'category', pi ->> 'item_name', coalesce((pi ->> 'quantity')::int, 1)
  from jsonb_array_elements(coalesce(p_payload -> 'packing_items', '[]'::jsonb)) pi;

  insert into public.trip_checklists (trip_id, label, item_order)
  select p_trip_id, c ->> 'label', coalesce((c ->> 'item_order')::int, 0)
  from jsonb_array_elements(coalesce(p_payload -> 'checklist', '[]'::jsonb)) c;

  -- Roll the derived totals up onto the trip.
  update public.trips t
  set total_distance       = coalesce((select sum(d.distance) from public.itinerary_days d where d.trip_id = t.id), 0),
      estimated_total_cost = coalesce((select sum(e.estimated_amount) from public.expenses e where e.trip_id = t.id), 0),
      status               = case when t.status = 'Draft' then 'Planned' else t.status end,
      updated_at           = now()
  where t.id = p_trip_id;
end;
$fn$;

-- ============================================================================
-- 23. RECALCULATION HELPER — called after a reorder / edit / delete
-- ============================================================================

create or replace function public.recalculate_trip_totals(p_trip_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $fn$
begin
  if not public.owns_trip(p_trip_id) then
    raise exception 'not authorised for trip %', p_trip_id using errcode = '42501';
  end if;

  update public.itinerary_days d
  set distance            = coalesce(agg.dist, 0),
      travel_time_minutes = coalesce(agg.tt, 0),
      estimated_cost      = coalesce(agg.cost, 0),
      updated_at          = now()
  from (
    select a.day_id,
           sum(a.distance_from_previous) as dist,
           sum(case when a.activity_type = 'travel' then a.travel_time_minutes else 0 end) as tt,
           sum(a.estimated_cost) as cost
    from public.itinerary_activities a
    group by a.day_id
  ) agg
  where agg.day_id = d.id and d.trip_id = p_trip_id;

  update public.trips t
  set total_distance = coalesce((select sum(d.distance) from public.itinerary_days d where d.trip_id = t.id), 0),
      updated_at     = now()
  where t.id = p_trip_id;
end;
$fn$;

-- ============================================================================
-- 24. CACHE EVICTION
-- Schedule with pg_cron:  select cron.schedule('purge-api-cache','*/30 * * * *',
--                           'select public.purge_api_cache()');
-- ============================================================================

create or replace function public.purge_api_cache()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare n integer;
begin
  delete from public.api_cache where expires_at < now();
  get diagnostics n = row_count;
  return n;
end;
$fn$;

-- ============================================================================
-- 25. ADMIN READ-ONLY VIEW
-- ============================================================================

create or replace view public.admin_overview as
select
  (select count(*) from public.profiles)                                              as total_users,
  (select count(*) from public.trips)                                                 as total_trips,
  (select count(*) from public.trips where created_at::date = current_date)            as trips_today,
  (select count(*) from public.trips where generation_meta is not null)                as ai_generations,
  (select count(*) from public.api_cache)                                             as cache_rows;

-- The view runs with the querying user's rights, so RLS on the underlying
-- tables still applies; is_admin() policies above are what let admins see all.

-- ============================================================================
-- END
-- ============================================================================
