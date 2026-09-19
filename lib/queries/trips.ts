import { sql } from '@/lib/db';
import { dayCount, type CreateTripInput } from '@/lib/validation';

/**
 * The data layer. Every function takes the caller's userId as its first
 * argument and scopes on it, because the service connection bypasses RLS —
 * see the note in lib/db.ts. There is deliberately no "get any trip by id".
 */

export type Trip = {
  id: string;
  user_id: string;
  trip_name: string;
  source: string;
  destination: string;
  start_date: string;
  end_date: string;
  number_of_days: number;
  number_of_nights: number;
  travellers: number;
  travel_mode: string;
  trip_type: string | null;
  budget_type: string;
  budget_amount: string | null;
  food_preference: string | null;
  hotel_preference: string | null;
  interests: string[];
  special_requirements: string | null;
  total_distance: string | null;
  estimated_total_cost: string | null;
  currency: string;
  status: string;
  created_at: string;
  updated_at: string;
};

/**
 * Neon Auth syncs users into neon_auth.users_sync out of band, so a profile row
 * may not exist yet on the first authenticated request. ensure_profile() is the
 * synchronous escape hatch the schema ships for exactly this.
 */
export async function ensureProfile(userId: string): Promise<void> {
  await sql`
    insert into public.profiles (id, email, full_name, avatar_url)
    select u.id, coalesce(u.email, ''), coalesce(u.name, u.raw_json ->> 'display_name'),
           u.raw_json ->> 'profile_image_url'
    from neon_auth.users_sync u
    where u.id = ${userId}
    on conflict (id) do nothing
  `;
}

export async function listTrips(userId: string): Promise<Trip[]> {
  return (await sql`
    select * from public.trips
    where user_id = ${userId}
    order by start_date desc, created_at desc
  `) as Trip[];
}

export async function getTrip(userId: string, tripId: string): Promise<Trip | null> {
  const rows = (await sql`
    select * from public.trips
    where id = ${tripId} and user_id = ${userId}
  `) as Trip[];
  return rows[0] ?? null;
}

export async function createTrip(userId: string, input: CreateTripInput): Promise<Trip> {
  const days = dayCount(input.start_date, input.end_date);
  const rows = (await sql`
    insert into public.trips (
      user_id, trip_name, source, destination, start_date, end_date,
      number_of_days, number_of_nights, travellers, travel_mode, trip_type,
      budget_type, budget_amount, food_preference, hotel_preference,
      interests, special_requirements, status
    ) values (
      ${userId}, ${input.trip_name}, ${input.source}, ${input.destination},
      ${input.start_date}, ${input.end_date},
      ${days}, ${Math.max(0, days - 1)}, ${input.travellers}, ${input.travel_mode},
      ${input.trip_type ?? null}, ${input.budget_type}, ${input.budget_amount ?? null},
      ${input.food_preference ?? null}, ${input.hotel_preference ?? null},
      ${JSON.stringify(input.interests)}::jsonb, ${input.special_requirements ?? null},
      'Draft'
    )
    returning *
  `) as Trip[];
  return rows[0];
}

export async function deleteTrip(userId: string, tripId: string): Promise<boolean> {
  const rows = (await sql`
    delete from public.trips
    where id = ${tripId} and user_id = ${userId}
    returning id
  `) as { id: string }[];
  return rows.length > 0;
}
