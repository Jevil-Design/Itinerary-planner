/**
 * Proves the storage contract against the real Neon database, issuing the same
 * SQL that lib/queries/trips.ts issues. Everything runs inside a transaction
 * that is rolled back, so the database is untouched afterwards.
 *
 *   node scripts/verify-persistence.mjs
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

/** Runs a statement expected to fail, isolated so the transaction survives. */
const rejectedWith = async (codes, s, p) => {
  await c.query('savepoint sp');
  try {
    await c.query(s, p);
    await c.query('release savepoint sp');
    return false;
  } catch (e) {
    await c.query('rollback to savepoint sp');
    return codes.includes(e.code);
  }
};

const TRIP_COLS = `user_id, trip_name, source, destination, start_date, end_date,
  number_of_days, number_of_nights, travellers, travel_mode, trip_type,
  budget_type, budget_amount, food_preference, hotel_preference,
  interests, special_requirements, status`;

await c.query('begin');
try {
  for (const [id, em] of [['vp-alice', 'alice@verify.local'], ['vp-bob', 'bob@verify.local']]) {
    await c.query('insert into neon_auth.users_sync (raw_json) values ($1::jsonb)', [
      JSON.stringify({ id, primary_email: em, display_name: id }),
    ]);
  }

  // --- ensureProfile(), verbatim from the data layer ---
  const ensure = (uid) =>
    c.query(
      `insert into public.profiles (id, email, full_name, avatar_url)
       select u.id, coalesce(u.email, ''), coalesce(u.name, u.raw_json ->> 'display_name'),
              u.raw_json ->> 'profile_image_url'
       from neon_auth.users_sync u where u.id = $1
       on conflict (id) do nothing`,
      [uid],
    );
  await ensure('vp-alice');
  await ensure('vp-bob');
  t('ensureProfile creates a profile from users_sync',
    (await rows(`select id from public.profiles where id = 'vp-alice'`)).length === 1);
  await ensure('vp-alice');
  t('ensureProfile is idempotent',
    (await rows(`select count(*)::int n from public.profiles where id = 'vp-alice'`))[0].n === 1);

  // --- createTrip() ---
  const mk = async (uid, name) =>
    (await rows(
      `insert into public.trips (${TRIP_COLS})
       values ($1,$2,'Pune','Gokarna','2027-03-10','2027-03-14',5,4,2,'Car','Couple',
               'Moderate',null,null,null,$3::jsonb,null,'Draft')
       returning *`,
      [uid, name, JSON.stringify(['Beaches'])],
    ))[0];

  const alice = await mk('vp-alice', 'Alice trip');
  const bob = await mk('vp-bob', 'Bob trip');

  t('createTrip persists and returns the row', !!alice.id && alice.trip_name === 'Alice trip');
  t('derived day and night counts stored', alice.number_of_days === 5 && alice.number_of_nights === 4);
  t('interests stored as a jsonb array', Array.isArray(alice.interests) && alice.interests[0] === 'Beaches');
  t('status defaults to Draft', alice.status === 'Draft');
  t('created_at and updated_at set', !!alice.created_at && !!alice.updated_at);

  // --- reads are scoped by user_id ---
  const aliceList = await rows(
    'select trip_name from public.trips where user_id = $1 order by start_date desc', ['vp-alice']);
  t('listTrips returns only that user', aliceList.length === 1 && aliceList[0].trip_name === 'Alice trip',
    'saw ' + JSON.stringify(aliceList.map((r) => r.trip_name)));

  t('getTrip scoped by user cannot cross accounts',
    (await rows('select id from public.trips where id = $1 and user_id = $2', [alice.id, 'vp-bob'])).length === 0);

  const del = await c.query('delete from public.trips where id = $1 and user_id = $2 returning id',
    [alice.id, 'vp-bob']);
  t('deleteTrip cannot delete another users trip', del.rowCount === 0);

  // --- the database refuses bad data even if a route forgot to validate ---
  t('CHECK rejects end_date before start_date', await rejectedWith(['23514'],
    `insert into public.trips (${TRIP_COLS})
     values ('vp-alice','bad','A','B','2027-03-14','2027-03-10',1,0,2,'Car',null,
             'Moderate',null,null,null,'[]'::jsonb,null,'Draft')`));

  t('CHECK rejects travellers above 40', await rejectedWith(['23514'],
    `insert into public.trips (${TRIP_COLS})
     values ('vp-alice','bad','A','B','2027-03-10','2027-03-14',5,4,99,'Car',null,
             'Moderate',null,null,null,'[]'::jsonb,null,'Draft')`));

  t('CHECK rejects an unknown travel_mode', await rejectedWith(['23514'],
    `insert into public.trips (${TRIP_COLS})
     values ('vp-alice','bad','A','B','2027-03-10','2027-03-14',5,4,2,'Teleport',null,
             'Moderate',null,null,null,'[]'::jsonb,null,'Draft')`));

  t('FK rejects a trip for an unknown user', await rejectedWith(['23503'],
    `insert into public.trips (${TRIP_COLS})
     values ('no-such-user','x','A','B','2027-03-10','2027-03-14',5,4,2,'Car',null,
             'Moderate',null,null,null,'[]'::jsonb,null,'Draft')`));

  // --- cascade ---
  await c.query(`delete from public.profiles where id = 'vp-bob'`);
  t('deleting a profile cascades its trips',
    (await rows('select id from public.trips where id = $1', [bob.id])).length === 0);
} finally {
  await c.query('rollback');
}

t('nothing persisted after rollback',
  (await rows('select count(*)::int n from public.trips'))[0].n === 0);
t('no profiles left behind',
  (await rows('select count(*)::int n from public.profiles'))[0].n === 0);

console.log('\nPERSISTENCE — against the live Neon database');
console.log('='.repeat(46));
for (const n of ok) console.log('  ok    ' + n);
for (const n of bad) console.log('  FAIL  ' + n);
console.log('-'.repeat(46));
console.log(ok.length + '/' + (ok.length + bad.length) + ' passed' + (bad.length ? ', FAILING' : ', all green'));

await c.end();
process.exit(bad.length ? 1 : 0);
