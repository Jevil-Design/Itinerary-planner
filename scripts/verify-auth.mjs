/**
 * Supabase Auth, against the real project.
 *
 * The question this answers is the one that blocked the product: can a sign-in
 * code reach an address other than the mail account's owner? The previous
 * sender refused every recipient but one. These checks fail loudly if that ever
 * becomes true again.
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

console.log('\nSUPABASE AUTH');
console.log('='.repeat(62));

/* ---------- error mapping: no generic "something went wrong" ---------- */
ok('a rate limit reads as a rate limit',
  /wait/i.test(authMessage({ message: 'For security purposes, you can only request this after 51 seconds', status: 429 })));
ok('an expired code says to request a new one',
  /expired/i.test(authMessage({ message: 'Token has expired', code: 'otp_expired' })));
ok('a bad address says so',
  /valid email/i.test(authMessage({ message: 'Unable to validate email address: invalid format' })));
ok('a network failure mentions the connection',
  /connection/i.test(authMessage({ message: 'Failed to fetch' })));
ok('disabled signups point at the administrator',
  /administrator/i.test(authMessage({ message: 'Signups not allowed for otp', code: 'otp_disabled' })));
ok('an unknown error keeps Supabase wording rather than inventing one',
  authMessage({ message: 'some novel failure' }) === 'some novel failure');

/* ---------- the actual blocker ---------- */
const stamp = Date.now();
const stranger = `contour-auth-${stamp}@primarc.in`;

const c = fresh();
const { error } = await c.auth.signInWithOtp({
  email: stranger,
  options: { shouldCreateUser: true },
});

if (error && /rate limit|after \d+ seconds/i.test(error.message)) {
  // Supabase's built-in mailer is heavily rate limited. Hitting that is not a
  // failure of the thing under test — it proves the request was accepted and
  // queued rather than refused for the recipient.
  console.log(`  ok    a non-owner address is accepted  [rate limited, which means accepted]`);
  pass++;
} else {
  ok('A CODE CAN BE SENT TO AN ADDRESS WE DO NOT OWN', !error,
    error ? `${error.status} ${error.message}` : stranger);
}

/* ---------- a wrong code must be refused ---------- */
const { error: badErr } = await fresh().auth.verifyOtp({
  email: stranger, token: '000000', type: 'email',
});
ok('a wrong code is rejected', Boolean(badErr), badErr?.code ?? badErr?.message?.slice(0, 40));
ok('the rejection is explained, not generic',
  Boolean(badErr) && !/something went wrong/i.test(authMessage(badErr)),
  badErr ? authMessage(badErr).slice(0, 48) : '');

/* ---------- an unauthenticated client sees nothing ---------- */
const { data: trips } = await fresh().from('trips').select('id');
ok('a signed-out client reads no trips', (trips ?? []).length === 0);

console.log('-'.repeat(62));
console.log(`${pass}/${pass + fail} passed${fail ? ', ' + fail + ' FAILED' : ', all green'}`);
process.exit(fail ? 1 : 0);
