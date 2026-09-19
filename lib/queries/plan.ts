import { sql } from '@/lib/db';
import type { Plan } from '@/lib/itinerary/plan';

/**
 * Writes a whole plan, or none of it.
 *
 * schema.neon.sql ships save_generated_trip() for this, but that function is
 * SECURITY INVOKER and gates on owns_trip(), which reads current_user_id() from
 * the JWT. The service connection carries no JWT, so it would always raise
 * 42501. Rather than weaken the function, the transaction is assembled here and
 * ownership is proved by the caller's own scoped query first.
 *
 * sql.transaction() sends the statements in one transaction over one
 * connection, so a failure part-way leaves no half-created trip — the guarantee
 * the README makes about generation.
 */
export async function replacePlan(userId: string, tripId: string, plan: Plan): Promise<void> {
  // Prove ownership before writing anything. The service connection bypasses
  // RLS, so this is the gate, not a formality.
  const owned = (await sql`
    select id from public.trips where id = ${tripId} and user_id = ${userId}
  `) as { id: string }[];
  if (owned.length === 0) {
    const e = new Error('not authorised for trip ' + tripId) as Error & { code?: string };
    e.code = '42501';
    throw e;
  }

  const statements = [
    // itinerary_days cascades to itinerary_activities
    sql`delete from public.itinerary_days   where trip_id = ${tripId}`,
    sql`delete from public.routes           where trip_id = ${tripId}`,
    sql`delete from public.hotels           where trip_id = ${tripId}`,
    sql`delete from public.restaurants      where trip_id = ${tripId}`,
    sql`delete from public.sightseeing_places where trip_id = ${tripId}`,
    sql`delete from public.expenses         where trip_id = ${tripId}`,
    sql`delete from public.packing_items    where trip_id = ${tripId}`,
    sql`delete from public.trip_checklists  where trip_id = ${tripId}`,
  ];

  for (const d of plan.days) {
    statements.push(sql`
      insert into public.itinerary_days (trip_id, day_number, date, title, location, summary)
      values (${tripId}, ${d.day_number}, ${d.date}, ${d.title}, ${d.location}, ${d.summary})
    `);
  }
  for (const r of plan.routes) {
    statements.push(sql`
      insert into public.routes (trip_id, route_order, from_location, to_location, verified)
      values (${tripId}, ${r.route_order}, ${r.from_location}, ${r.to_location}, false)
    `);
  }
  for (const p of plan.packing) {
    statements.push(sql`
      insert into public.packing_items (trip_id, category, item_name, quantity)
      values (${tripId}, ${p.category}, ${p.item_name}, ${p.quantity})
    `);
  }
  for (const c of plan.checklist) {
    statements.push(sql`
      insert into public.trip_checklists (trip_id, label, item_order)
      values (${tripId}, ${c.label}, ${c.item_order})
    `);
  }
  for (const e of plan.expenses) {
    statements.push(sql`
      insert into public.expenses (trip_id, category, estimated_amount, currency, expense_date)
      values (${tripId}, ${e.category}, 0, ${e.currency}, ${e.expense_date})
    `);
  }

  // Draft becomes Planned; totals stay 0 because nothing has measured them yet.
  statements.push(sql`
    update public.trips
    set status = case when status = 'Draft' then 'Planned' else status end,
        updated_at = now()
    where id = ${tripId} and user_id = ${userId}
  `);

  await sql.transaction(statements);
}

export type PlanCounts = {
  days: number; routes: number; packing: number; checklist: number; expenses: number;
};

export async function planCounts(userId: string, tripId: string): Promise<PlanCounts> {
  const rows = (await sql`
    select
      (select count(*) from public.itinerary_days  d where d.trip_id = t.id)::int as days,
      (select count(*) from public.routes          r where r.trip_id = t.id)::int as routes,
      (select count(*) from public.packing_items   p where p.trip_id = t.id)::int as packing,
      (select count(*) from public.trip_checklists c where c.trip_id = t.id)::int as checklist,
      (select count(*) from public.expenses        e where e.trip_id = t.id)::int as expenses
    from public.trips t
    where t.id = ${tripId} and t.user_id = ${userId}
  `) as PlanCounts[];
  return rows[0] ?? { days: 0, routes: 0, packing: 0, checklist: 0, expenses: 0 };
}
