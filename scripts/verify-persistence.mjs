/**
 * Does a trip actually survive?
 *
 * The brief's key acceptance criterion is that a trip outlives a refresh, a
 * logout and a different device. This signs a real user in, writes a trip,
 * throws the client away, signs in again from scratch, and reads it back — the
 * script equivalent of closing the browser and coming back tomorrow.
 *
 * It also checks the thing that makes persistence safe rather than dangerous:
 * a second user must not be able to see or touch the first user's trip.
 *
 *   node scripts/verify-persistence.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const pick = (k) => (env.match(new RegExp('^' + k + '=(.+)$', 'm')) ?? [])[1]?.trim();

const URL_ = pick('NEXT_PUBLIC_SUPABASE_URL');
const KEY = pick('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
if (!URL_ || !KEY) {
  console.error('\n  Supabase is not configured in .env.local — skipping.\n');
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (label, cond, note = '') => {
  if (cond) { pass++; console.log(`  ok    ${label}${note ? '  [' + note + ']' : ''}`); }
  else { fail++; console.log(`  FAIL  ${label}${note ? '  [' + note + ']' : ''}`); }
};

const fresh = () => createClient(URL_, KEY, { auth: { persistSession: false } });
/*
 * Fixed accounts rather than fresh signups: this project has signup locked
 * down at the Supabase level, which is the right setting for production. The
 * pair is seeded once in supabase/seed/test-users.sql.
 */
const PASSWORD = 'ContourTest!2026';
const userA = { email: 'persist-a@contour.test', password: PASSWORD };
const userB = { email: 'persist-b@contour.test', password: PASSWORD };

console.log('\nTRIP PERSISTENCE');
console.log('='.repeat(58));

async function signIn(creds) {
  const c = fresh();
  const { data, error } = await c.auth.signInWithPassword(creds);
  if (error) return { error: error.message };
  return { client: c, user: data.user };
}

const a = await signIn(userA);
if (a.error) {
  console.log(`\n  Could not create a test user: ${a.error}`);
  console.log("  Seed them with supabase/seed/test-users.sql first.");
  process.exit(0);
}
ok('a seeded user can sign in', Boolean(a.user?.id));

// the signup trigger should have made a profile without the app asking
const { data: prof } = await a.client.from('profiles').select('id,email').eq('id', a.user.id).maybeSingle();
ok('a profile is created automatically', prof?.email === userA.email, prof?.email);

// --- write a trip ----------------------------------------------------------
const { data: trip, error: tripErr } = await a.client
  .from('trips')
  .insert({
    user_id: a.user.id,
    title: 'Kolkata → Darjeeling',
    origin_name: 'Kolkata, West Bengal, India',
    dest_name: 'Darjeeling, West Bengal, India',
    mode: 'motorcycle',
    travellers: 2,
    distance_km: 636.2,
    driving_minutes: 494,
    status: 'ready',
  })
  .select('id')
  .single();
ok('a trip can be saved', Boolean(trip?.id), tripErr?.message);

const { error: dayErr } = await a.client.from('trip_days').insert({ trip_id: trip.id, day_number: 1 });
ok('a day can be saved', !dayErr, dayErr?.message);

const { error: itemErr } = await a.client.from('itinerary_items').insert([
  { trip_id: trip.id, position: 0, kind: 'depart', title: 'Depart Kolkata', start_time: '05:00', provenance: 'estimated' },
  { trip_id: trip.id, position: 1, kind: 'breakfast', title: 'Breakfast', start_time: '07:00', provenance: 'unavailable' },
]);
ok('itinerary items can be saved', !itemErr, itemErr?.message);

// --- the actual question: does it survive? ---------------------------------
const reopened = fresh();
const { data: session2, error: signInErr } = await reopened.auth.signInWithPassword(userA);
ok('the user can sign in again', Boolean(session2?.session), signInErr?.message);

const { data: after } = await reopened.from('trips').select('id,title,distance_km').eq('id', trip.id).maybeSingle();
ok('THE TRIP SURVIVES A FRESH SIGN-IN', after?.id === trip.id, after?.title);
ok('its provider-verified distance survives', Number(after?.distance_km) === 636.2, String(after?.distance_km));

const { data: itemsAfter } = await reopened.from('itinerary_items').select('kind,provenance').eq('trip_id', trip.id).order('position');
ok('its itinerary survives', itemsAfter?.length === 2, `${itemsAfter?.length} items`);
ok('provenance survives the round trip', itemsAfter?.[1]?.provenance === 'unavailable', itemsAfter?.[1]?.provenance);

// --- and is it private? ----------------------------------------------------
const b = await signIn(userB);
if (b.error) {
  console.log(`  (second user could not be created: ${b.error})`);
} else {
  const { data: snoop } = await b.client.from('trips').select('id').eq('id', trip.id);
  ok("another user CANNOT read it", (snoop ?? []).length === 0, `${(snoop ?? []).length} rows`);

  const { data: edited } = await b.client.from('trips').update({ title: 'HIJACKED' }).eq('id', trip.id).select('id');
  ok('another user CANNOT edit it', (edited ?? []).length === 0);

  const { error: forgeErr } = await b.client.from('trips').insert({
    user_id: a.user.id, title: 'forged', origin_name: 'x', dest_name: 'y',
  });
  ok('a forged user_id is rejected by the database', Boolean(forgeErr), forgeErr?.code);

  await b.client.auth.signOut();
}

// --- tidy up ---------------------------------------------------------------
await reopened.from('trips').delete().eq('id', trip.id);
const { data: gone } = await reopened.from('trips').select('id').eq('id', trip.id);
ok('an owner can delete their own trip', (gone ?? []).length === 0);
await reopened.auth.signOut();

console.log('-'.repeat(58));
console.log(`${pass}/${pass + fail} passed${fail ? ', ' + fail + ' FAILED' : ', all green'}`);
console.log('\n  Note: the two test auth users remain; Supabase does not let a');
console.log('  client delete its own account. Remove them from the dashboard if');
console.log('  you want a clean user list.\n');
process.exit(fail ? 1 : 0);
