/**
 * Email + password authentication, and the isolation that makes it safe.
 *
 * Two real accounts are used, and the central question is the one the brief
 * asks: can A reach B's trip by knowing its UUID? The answer has to come from
 * the database refusing, not from the UI hiding it, so every attempt here is
 * made with a client that is properly signed in as the wrong person.
 *
 *   node scripts/verify-auth.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { authMessage } from '../lib/supabase/client.ts';

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
 * Fixed accounts, seeded by supabase/seed/test-users.sql. Signing up fresh ones
 * each run would spend the project's hourly confirmation-email allowance, which
 * is only a handful — the tests would start denying real users a sign-in.
 */
const PASSWORD = 'ContourTest!2026';
const A = { email: 'persist-a@contour.test', password: PASSWORD };
const B = { email: 'persist-b@contour.test', password: PASSWORD };

console.log('\nAUTHENTICATION & ISOLATION');
console.log('='.repeat(64));

/* ---------- error mapping: never a bare "something went wrong" ---------- */
ok('wrong credentials read as wrong credentials',
  /do not match/i.test(authMessage({ message: 'Invalid login credentials', code: 'invalid_credentials' })));
ok('the message does not reveal whether the address exists',
  !/no account|not found|unknown/i.test(authMessage({ message: 'Invalid login credentials', code: 'invalid_credentials' })));
ok('a duplicate signup points at signing in',
  /already exists/i.test(authMessage({ message: 'User already registered', code: 'user_already_exists' })));
ok('a weak password says the minimum',
  /8 characters/i.test(authMessage({ message: 'Password should be at least 6 characters', code: 'weak_password' })));
ok('an unconfirmed email says to check the inbox',
  /confirm/i.test(authMessage({ message: 'Email not confirmed', code: 'email_not_confirmed' })));
ok('a short throttle quotes the real wait',
  /51 seconds/.test(authMessage({ message: 'you can only request this after 51 seconds', status: 429 })));
ok('an unknown error keeps Supabase wording',
  authMessage({ message: 'some novel failure' }) === 'some novel failure');

/* ---------- sign in ---------- */
const a = fresh();
const { data: aSession, error: aErr } = await a.auth.signInWithPassword(A);
if (aErr) {
  console.log(`\n  Could not sign in as ${A.email}: ${aErr.message}`);
  console.log('  Seed the accounts with supabase/seed/test-users.sql first.\n');
  process.exit(0);
}
ok('a password sign-in succeeds', Boolean(aSession.session));
ok('it yields a verified user', Boolean(aSession.user?.id));

const { error: wrongErr } = await fresh().auth.signInWithPassword({ ...A, password: 'definitely-not-it' });
ok('the wrong password is refused', Boolean(wrongErr), wrongErr?.code);
ok('an unknown address is refused the same way', Boolean(
  (await fresh().auth.signInWithPassword({ email: 'nobody-here@contour.test', password: PASSWORD })).error));

/* ---------- the profile exists, with a name ---------- */
const { data: profile } = await a.from('profiles').select('id, email, full_name, avatar_url').eq('id', aSession.user.id).maybeSingle();
ok('a profile row exists for the account', profile?.email === A.email, profile?.email);
ok('the profile carries no password column', profile ? !('password' in profile) : false);

/* ---------- A creates a trip and an itinerary ---------- */
const { data: trip, error: tripErr } = await a
  .from('trips')
  .insert({
    user_id: aSession.user.id,
    title: 'Isolation test trip',
    origin_name: 'Kolkata', dest_name: 'Darjeeling',
    mode: 'car', travellers: 2, status: 'ready',
  })
  .select('id')
  .single();
ok("A can create A's trip", Boolean(trip?.id), tripErr?.message);

const { error: itinErr } = await a.from('itineraries').insert({
  trip_id: trip.id, user_id: aSession.user.id,
  itinerary_data: { days: 2, note: 'private to A' },
});
ok("A can store A's itinerary", !itinErr, itinErr?.message);

/* ---------- B tries everything ---------- */
const b = fresh();
const { data: bSession, error: bErr } = await b.auth.signInWithPassword(B);
ok('the second account can sign in', Boolean(bSession?.session), bErr?.message);

const { data: bSeesTrips } = await b.from('trips').select('id').eq('id', trip.id);
ok("B CANNOT READ A'S TRIP BY ITS UUID", (bSeesTrips ?? []).length === 0, `${(bSeesTrips ?? []).length} rows`);

const { data: bSeesItin } = await b.from('itineraries').select('id').eq('trip_id', trip.id);
ok("B CANNOT READ A'S ITINERARY", (bSeesItin ?? []).length === 0, `${(bSeesItin ?? []).length} rows`);

const { data: bEdited } = await b.from('trips').update({ title: 'HIJACKED' }).eq('id', trip.id).select('id');
ok("B cannot edit A's trip", (bEdited ?? []).length === 0);

const { data: bDeleted } = await b.from('trips').delete().eq('id', trip.id).select('id');
ok("B cannot delete A's trip", (bDeleted ?? []).length === 0);

const { error: forgeErr } = await b.from('trips').insert({
  user_id: aSession.user.id, title: 'forged', origin_name: 'x', dest_name: 'y',
});
ok('a forged user_id is rejected by the database', Boolean(forgeErr), forgeErr?.code);

const { error: attachErr } = await b.from('itineraries').insert({
  trip_id: trip.id, user_id: bSession.user.id, itinerary_data: {},
});
ok("B cannot attach an itinerary to A's trip", Boolean(attachErr), attachErr?.code);

/* ---------- and A still can ---------- */
const { data: aStillSees } = await a.from('trips').select('id, title').eq('id', trip.id).maybeSingle();
ok("A can still read A's own trip", aStillSees?.id === trip.id, aStillSees?.title);

/* ---------- persistence across a fresh sign-in ---------- */
const reopened = fresh();
await reopened.auth.signInWithPassword(A);
const { data: afterRelogin } = await reopened.from('trips').select('id').eq('id', trip.id).maybeSingle();
ok('THE TRIP SURVIVES SIGN-OUT AND SIGN-IN', afterRelogin?.id === trip.id);
const { data: itinAfter } = await reopened.from('itineraries').select('itinerary_data').eq('trip_id', trip.id).maybeSingle();
ok('the itinerary survives too', itinAfter?.itinerary_data?.note === 'private to A');

/* ---------- signed out sees nothing ---------- */
const anon = fresh();
ok('a signed-out client reads no trips', ((await anon.from('trips').select('id')).data ?? []).length === 0);
ok('a signed-out client reads no itineraries', ((await anon.from('itineraries').select('id')).data ?? []).length === 0);

/* ---------- tidy ---------- */
await reopened.from('trips').delete().eq('id', trip.id);
const { data: gone } = await reopened.from('trips').select('id').eq('id', trip.id);
ok('an owner can delete their own trip', (gone ?? []).length === 0);
const { data: cascaded } = await reopened.from('itineraries').select('id').eq('trip_id', trip.id);
ok('deleting a trip removes its itinerary', (cascaded ?? []).length === 0);

await a.auth.signOut();
await b.auth.signOut();
await reopened.auth.signOut();

console.log('-'.repeat(64));
console.log(`${pass}/${pass + fail} passed${fail ? ', ' + fail + ' FAILED' : ', all green'}`);
process.exit(fail ? 1 : 0);
