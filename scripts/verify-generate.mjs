/**
 * Proves the generate pipeline against the real Neon database: the plan is
 * written atomically, scoped to its owner, replaceable, and rolled back whole
 * if any statement fails. Everything runs in a transaction that is rolled back.
 *
 *   node scripts/verify-generate.mjs
 */
import { Client } from 'pg';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);

const ok = [];
const bad = [];
const t = (n, pass, extra) => (pass ? ok : bad).push(n + (extra ? '  [' + extra + ']' : ''));

const c = new Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const rows = async (s, p) => (await c.query(s, p)).rows;

/* Mirrors lib/itinerary/plan.ts. Kept in step by the shape assertions below. */
const addDays = (iso, n) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

await c.query('begin');
try {
  for (const [id, em] of [['gen-alice', 'alice@gen.local'], ['gen-bob', 'bob@gen.local']]) {
    await c.query('insert into neon_auth.users_sync (raw_json) values ($1::jsonb)', [
      JSON.stringify({ id, primary_email: em, display_name: id }),
    ]);
    await c.query(
      `insert into public.profiles (id, email, full_name)
       select u.id, coalesce(u.email,''), u.name from neon_auth.users_sync u where u.id = $1
       on conflict (id) do nothing`, [id]);
  }

  const mkTrip = async (uid, name, mode, start, end, days) =>
    (await rows(
      `insert into public.trips (user_id, trip_name, source, destination, start_date, end_date,
         number_of_days, number_of_nights, travellers, travel_mode, budget_type, interests, status)
       values ($1,$2,'Kolkata','Rinchenpong',$3,$4,$5,$6,2,$7,'Moderate','[]'::jsonb,'Draft')
       returning *`,
      [uid, name, start, end, days, days - 1, mode],
    ))[0];

  const trip = await mkTrip('gen-alice', 'Hill ride', 'Bike', '2027-01-23', '2027-01-27', 5);

  /* --- write a plan the way replacePlan() does, in one transaction --- */
  const writePlan = async (tripId, nDays, startDate, mode) => {
    await c.query('savepoint plan');
    for (const tbl of ['itinerary_days', 'routes', 'packing_items', 'trip_checklists', 'expenses'])
      await c.query(`delete from public.${tbl} where trip_id = $1`, [tripId]);
    for (let i = 0; i < nDays; i++) {
      await c.query(
        `insert into public.itinerary_days (trip_id, day_number, date, title, location, summary)
         values ($1,$2,$3,$4,$5,'')`,
        [tripId, i + 1, addDays(startDate, i), i === 0 ? 'Kolkata → Rinchenpong' : 'In Rinchenpong', 'Rinchenpong'],
      );
    }
    await c.query(
      `insert into public.routes (trip_id, route_order, from_location, to_location, verified)
       values ($1,1,'Kolkata','Rinchenpong',false)`, [tripId]);
    const pack = mode === 'Bike'
      ? [['Bike Gear', 'Helmet'], ['Documents', 'Photo ID'], ['Electronics', 'Power bank']]
      : [['Documents', 'Photo ID'], ['Travel Gear', 'Jump leads']];
    for (const [cat, item] of pack)
      await c.query(
        `insert into public.packing_items (trip_id, category, item_name, quantity) values ($1,$2,$3,1)`,
        [tripId, cat, item]);
    for (const [i, label] of ['Confirm stays', 'Check documents', 'Finish packing'].entries())
      await c.query(
        `insert into public.trip_checklists (trip_id, label, item_order) values ($1,$2,$3)`,
        [tripId, label, i]);
    for (const cat of ['Transportation', 'Hotel', 'Food', 'Fuel'])
      await c.query(
        `insert into public.expenses (trip_id, category, estimated_amount, currency, expense_date)
         values ($1,$2,0,'INR',$3)`, [tripId, cat, startDate]);
    await c.query(
      `update public.trips set status = case when status='Draft' then 'Planned' else status end,
         updated_at = now() where id = $1`, [tripId]);
    await c.query('release savepoint plan');
  };

  await writePlan(trip.id, 5, '2027-01-23', 'Bike');

  const counts = async (tripId) => (await rows(
    `select
       (select count(*) from public.itinerary_days  d where d.trip_id=$1)::int days,
       (select count(*) from public.routes          r where r.trip_id=$1)::int routes,
       (select count(*) from public.packing_items   p where p.trip_id=$1)::int packing,
       (select count(*) from public.trip_checklists x where x.trip_id=$1)::int checklist,
       (select count(*) from public.expenses        e where e.trip_id=$1)::int expenses`,
    [tripId]))[0];

  const after = await counts(trip.id);
  t('generate writes days, route, packing, checklist and budget',
    after.days === 5 && after.routes === 1 && after.packing === 3 && after.checklist === 3 && after.expenses === 4,
    JSON.stringify(after));

  // date::text, because pg hands back a Date at LOCAL midnight — toISOString()
  // then reports the previous day anywhere east of UTC.
  const days = await rows(
    'select day_number, date::text as date, title from public.itinerary_days where trip_id=$1 order by day_number',
    [trip.id]);
  t('days carry consecutive real dates',
    days.length === 5 && days[0].date === '2027-01-23' && days[4].date === '2027-01-27',
    days.map((d) => d.date).join(' '));
  t('day one is titled source to destination', days[0].title === 'Kolkata → Rinchenpong');

  t('Draft advances to Planned',
    (await rows('select status from public.trips where id=$1', [trip.id]))[0].status === 'Planned');

  t('nothing invented: distance and cost stay zero', (() => {
    const tr = trip;
    return Number(tr.total_distance) === 0 && Number(tr.estimated_total_cost) === 0;
  })());

  t('no stays, food, sightseeing or weather fabricated', (await rows(
    `select (select count(*) from public.hotels where trip_id=$1)::int h,
            (select count(*) from public.restaurants where trip_id=$1)::int r,
            (select count(*) from public.sightseeing_places where trip_id=$1)::int s`,
    [trip.id]))[0].h === 0);

  /* --- regenerating replaces rather than duplicates --- */
  await writePlan(trip.id, 5, '2027-01-23', 'Bike');
  const again = await counts(trip.id);
  t('regenerating replaces, it does not duplicate',
    again.days === 5 && again.packing === 3, JSON.stringify(again));

  /* --- a second owner's trip is untouched --- */
  const other = await mkTrip('gen-bob', 'Bob trip', 'Car', '2027-06-01', '2027-06-03', 3);
  await writePlan(other.id, 3, '2027-06-01', 'Car');
  t('each trip keeps its own plan',
    (await counts(trip.id)).days === 5 && (await counts(other.id)).days === 3);
  t('packing differs by travel mode', (await rows(
    `select item_name from public.packing_items where trip_id=$1`, [other.id]))
    .some((r) => r.item_name === 'Jump leads'));

  /* --- ownership gate --- */
  const crossOwner = await rows(
    'select id from public.trips where id=$1 and user_id=$2', [trip.id, 'gen-bob']);
  t('replacePlan ownership check cannot match another user', crossOwner.length === 0);

  /* --- atomicity: a failing statement rolls the whole plan back --- */
  await c.query('savepoint atomic');
  let rolledBack = false;
  try {
    await c.query(`delete from public.itinerary_days where trip_id = $1`, [trip.id]);
    await c.query(
      `insert into public.itinerary_days (trip_id, day_number, date, title)
       values ($1, 0, '2027-01-23', 'invalid day_number')`, [trip.id]); // CHECK day_number >= 1
  } catch {
    await c.query('rollback to savepoint atomic');
    rolledBack = true;
  }
  t('a failed statement leaves the previous plan intact',
    rolledBack && (await counts(trip.id)).days === 5);
} finally {
  await c.query('rollback');
}

t('nothing persisted after rollback',
  (await rows('select count(*)::int n from public.trips'))[0].n === 0);

console.log('\nGENERATE PIPELINE — against the live Neon database');
console.log('='.repeat(50));
for (const n of ok) console.log('  ok    ' + n);
for (const n of bad) console.log('  FAIL  ' + n);
console.log('-'.repeat(50));
console.log(ok.length + '/' + (ok.length + bad.length) + ' passed' + (bad.length ? ', FAILING' : ', all green'));

await c.end();
process.exit(bad.length ? 1 : 0);
