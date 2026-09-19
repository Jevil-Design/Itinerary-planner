/**
 * End-to-end itinerary run against the live Neon database, using the REAL
 * planner from lib/itinerary/plan.ts rather than a copy of its logic — so a
 * drift between the shipped code and the test cannot hide a bug.
 *
 * Creates a user, creates trips across a set of awkward shapes, generates each
 * one, reads every row back and checks it for the things that actually break a
 * UI: nulls, NaN, Invalid Date, non-consecutive days, duplicate ordering, and
 * category values the screens cannot render.
 *
 *   node --experimental-strip-types scripts/verify-itinerary-e2e.mjs
 */
import { Client } from 'pg';
import { readFileSync } from 'node:fs';
import { buildPlan } from '../lib/itinerary/plan.ts';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);

const ok = [];
const bad = [];
const t = (n, pass, extra) => (pass ? ok : bad).push(n + (extra ? '  [' + extra + ']' : ''));

/** Categories miscVals() iterates in the UI. Anything else silently vanishes. */
const UI_PACK_CATEGORIES = new Set([
  'Documents', 'Clothing', 'Weather Items', 'Electronics', 'Bike Gear', 'Toiletries', 'Travel Gear',
]);
/** The schema's CHECK on expenses.category. */
const DB_EXPENSE_CATEGORIES = new Set([
  'Transportation', 'Fuel', 'Toll', 'Hotel', 'Food', 'Activities',
  'Parking', 'Local Transport', 'Shopping', 'Miscellaneous', 'Emergency Buffer',
]);

const c = new Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const rows = async (s, p) => (await c.query(s, p)).rows;

const addDays = (iso, n) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Mirrors lib/queries/plan.ts replacePlan(), same statements, same order. */
async function replacePlan(tripId, plan) {
  for (const tbl of ['itinerary_days', 'routes', 'hotels', 'restaurants',
    'sightseeing_places', 'expenses', 'packing_items', 'trip_checklists']) {
    await c.query(`delete from public.${tbl} where trip_id = $1`, [tripId]);
  }
  for (const d of plan.days) {
    await c.query(
      `insert into public.itinerary_days (trip_id, day_number, date, title, location, summary)
       values ($1,$2,$3,$4,$5,$6)`,
      [tripId, d.day_number, d.date, d.title, d.location, d.summary]);
  }
  for (const r of plan.routes) {
    await c.query(
      `insert into public.routes (trip_id, route_order, from_location, to_location, verified)
       values ($1,$2,$3,$4,false)`,
      [tripId, r.route_order, r.from_location, r.to_location]);
  }
  for (const p of plan.packing) {
    await c.query(
      `insert into public.packing_items (trip_id, category, item_name, quantity)
       values ($1,$2,$3,$4)`, [tripId, p.category, p.item_name, p.quantity]);
  }
  for (const x of plan.checklist) {
    await c.query(
      `insert into public.trip_checklists (trip_id, label, item_order) values ($1,$2,$3)`,
      [tripId, x.label, x.item_order]);
  }
  for (const e of plan.expenses) {
    await c.query(
      `insert into public.expenses (trip_id, category, estimated_amount, currency, expense_date)
       values ($1,$2,0,$3,$4)`, [tripId, e.category, e.currency, e.expense_date]);
  }
  await c.query(
    `update public.trips set status = case when status='Draft' then 'Planned' else status end,
       updated_at = now() where id = $1`, [tripId]);
}

await c.query('begin');
try {
  await c.query('insert into neon_auth.users_sync (raw_json) values ($1::jsonb)',
    [JSON.stringify({ id: 'e2e-user', primary_email: 'e2e@test.local', display_name: 'E2E' })]);
  // on_auth_user_created has already created this row from users_sync; this is
  // the ensure_profile() path, which must be safe to run anyway.
  const before = (await c.query(
    `select count(*)::int n from public.profiles where id='e2e-user'`)).rows[0].n;
  await c.query(
    `insert into public.profiles (id, email, full_name)
     select u.id, coalesce(u.email,''), u.name from neon_auth.users_sync u where u.id='e2e-user'
     on conflict (id) do nothing`);
  t('signup trigger created the profile from users_sync', before === 1);
  t('ensure_profile is safe to run on top of it',
    (await rows(`select count(*)::int n from public.profiles where id='e2e-user'`))[0].n === 1);

  const SHAPES = [
    { label: 'ordinary 5-day bike trip', src: 'Kolkata', dst: 'Rinchenpong', mode: 'Bike', start: '2027-01-23', end: '2027-01-27' },
    { label: 'single-day trip', src: 'Pune', dst: 'Lonavala', mode: 'Car', start: '2027-04-10', end: '2027-04-10' },
    { label: 'crosses a month boundary', src: 'Delhi', dst: 'Jaipur', mode: 'Train', start: '2027-01-30', end: '2027-02-02' },
    { label: 'crosses a year boundary', src: 'Goa', dst: 'Hampi', mode: 'Bus', start: '2027-12-30', end: '2028-01-02' },
    { label: 'crosses a leap day', src: 'Kochi', dst: 'Munnar', mode: 'Car', start: '2028-02-27', end: '2028-03-01' },
    { label: 'apostrophe and unicode in names', src: "O'Brien's Landing", dst: 'Gokarṇa — दक्षिण', mode: 'Flight', start: '2027-07-01', end: '2027-07-04' },
    { label: 'long trip, 90 days', src: 'Leh', dst: 'Kanyakumari', mode: 'Mixed', start: '2027-03-01', end: '2027-05-29' },
  ];

  for (const shape of SHAPES) {
    const days = Math.round(
      (Date.parse(shape.end + 'T00:00:00Z') - Date.parse(shape.start + 'T00:00:00Z')) / 86400000) + 1;

    const trip = (await rows(
      `insert into public.trips (user_id, trip_name, source, destination, start_date, end_date,
         number_of_days, number_of_nights, travellers, travel_mode, budget_type, interests, status)
       values ('e2e-user',$1,$2,$3,$4,$5,$6,$7,2,$8,'Moderate','[]'::jsonb,'Draft')
       returning id, source, destination, start_date::text as start_date,
                 number_of_days, travel_mode, currency`,
      [shape.label, shape.src, shape.dst, shape.start, shape.end, days, Math.max(0, days - 1), shape.mode],
    ))[0];

    // the real planner, on a row straight out of the database
    const plan = buildPlan(trip);
    await replacePlan(trip.id, plan);

    const got = await rows(
      `select day_number, date::text as date, title, location, summary
       from public.itinerary_days where trip_id=$1 order by day_number`, [trip.id]);

    const problems = [];
    if (got.length !== days) problems.push(`expected ${days} days, got ${got.length}`);
    got.forEach((d, i) => {
      if (d.day_number !== i + 1) problems.push(`day_number gap at ${i}`);
      if (d.date !== addDays(shape.start, i)) problems.push(`date ${d.date} != ${addDays(shape.start, i)}`);
      for (const [k, v] of Object.entries(d)) {
        if (v === null) problems.push(`null ${k} on day ${d.day_number}`);
        if (typeof v === 'string' && /undefined|NaN|Invalid Date|\[object/.test(v)) {
          problems.push(`bad ${k} on day ${d.day_number}: ${v}`);
        }
      }
    });
    if (got.length && got[0].title !== `${shape.src} → ${shape.dst}`) {
      problems.push(`day 1 title: ${got[0].title}`);
    }

    const pack = await rows('select category, item_name, quantity from public.packing_items where trip_id=$1', [trip.id]);
    for (const p of pack) {
      if (!UI_PACK_CATEGORIES.has(p.category)) problems.push(`packing category the UI cannot render: ${p.category}`);
      if (!p.item_name || p.quantity < 1) problems.push('bad packing row');
    }
    const exp = await rows('select category from public.expenses where trip_id=$1', [trip.id]);
    for (const e of exp) {
      if (!DB_EXPENSE_CATEGORIES.has(e.category)) problems.push(`expense category outside the CHECK: ${e.category}`);
    }
    const route = await rows('select from_location, to_location, distance_km from public.routes where trip_id=$1', [trip.id]);
    if (route.length !== 1) problems.push(`expected 1 route leg, got ${route.length}`);
    if (route[0] && (route[0].from_location !== shape.src || route[0].to_location !== shape.dst)) {
      problems.push('route endpoints wrong');
    }

    t('e2e: ' + shape.label, problems.length === 0, problems.slice(0, 3).join(' · '));
  }

  /* --- integrity across the whole set --- */
  t('every day belongs to a real trip', (await rows(
    `select count(*)::int n from public.itinerary_days d
     left join public.trips t on t.id = d.trip_id where t.id is null`))[0].n === 0);
  t('no duplicate day numbers within a trip', (await rows(
    `select count(*)::int n from (
       select trip_id, day_number from public.itinerary_days
       group by trip_id, day_number having count(*) > 1) x`))[0].n === 0);
  t('every trip advanced from Draft to Planned', (await rows(
    `select count(*)::int n from public.trips where status <> 'Planned'`))[0].n === 0);
  t('nothing fabricated for stays, food or sightseeing', (await rows(
    `select (select count(*) from public.hotels)::int
          + (select count(*) from public.restaurants)::int
          + (select count(*) from public.sightseeing_places)::int as n`))[0].n === 0);
  t('no distance or cost invented anywhere', (await rows(
    `select count(*)::int n from public.trips
     where coalesce(total_distance,0) <> 0 or coalesce(estimated_total_cost,0) <> 0`))[0].n === 0);
  t('the 90-day trip really wrote 90 days', (await rows(
    `select count(*)::int n from public.itinerary_days d
     join public.trips t on t.id=d.trip_id where t.trip_name = 'long trip, 90 days'`))[0].n === 90);
} finally {
  await c.query('rollback');
}

t('nothing persisted after rollback',
  (await rows('select count(*)::int n from public.trips'))[0].n === 0);

console.log('\nITINERARY END TO END — live Neon, real planner');
console.log('='.repeat(52));
for (const n of ok) console.log('  ok    ' + n);
for (const n of bad) console.log('  FAIL  ' + n);
console.log('-'.repeat(52));
console.log(ok.length + '/' + (ok.length + bad.length) + ' passed' + (bad.length ? ', FAILING' : ', all green'));

await c.end();
process.exit(bad.length ? 1 : 0);
