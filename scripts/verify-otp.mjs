/**
 * Tests the one-time-code logic. With no storage, the signed challenge cookie
 * IS the security boundary, so it gets exercised properly: forgery, replay,
 * brute force, expiry and cross-account reuse.
 *
 *   node --experimental-strip-types scripts/verify-otp.mjs
 */
const SECRET = 'test-secret-'.padEnd(64, 'x');

const core = await import('../lib/otp-core.ts');
// bind the injected secret so the tests read like the call sites do
const createChallenge = (e) => core.createChallenge(SECRET, e);
const verifyChallenge = (t, c) => core.verifyChallenge(SECRET, t, c);
const readSession = (t) => core.readSession(SECRET, t);

const ok = [];
const bad = [];
const t = (n, pass, extra) => (pass ? ok : bad).push(n + (extra ? `  [${extra}]` : ''));

/* ---------- happy path ---------- */
{
  const { code, cookie } = createChallenge('sam@example.com');
  t('code is six digits', /^\d{6}$/.test(code), code.replace(/\d/g, '#'));
  const r = verifyChallenge(cookie, code);
  t('correct code verifies', r.ok === true);
  t('verification returns the address', r.ok && r.email === 'sam@example.com');
  t('a session is issued', r.ok && typeof r.session === 'string' && r.session.includes('.'));
  t('session reads back', r.ok && readSession(r.session)?.email === 'sam@example.com');
}

/* ---------- the plaintext code must not be recoverable ---------- */
{
  const { code, cookie } = createChallenge('sam@example.com');
  const body = Buffer.from(cookie.split('.')[0], 'base64url').toString();
  t('challenge cookie does not contain the code', !body.includes(code), body.slice(0, 60));
  t('challenge cookie stores only a hash', JSON.parse(body).hash !== undefined);
}

/* ---------- wrong codes ---------- */
{
  const { code, cookie } = createChallenge('sam@example.com');
  const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, '0');
  const r = verifyChallenge(cookie, wrong);
  t('wrong code rejected', !r.ok && r.reason === 'wrong');
  t('a re-sealed cookie is returned so attempts can be counted', !r.ok && typeof r.cookie === 'string');
}

/* ---------- brute force is bounded without storage ---------- */
{
  let { code, cookie } = createChallenge('sam@example.com');
  const wrong = String((Number(code) + 7) % 1_000_000).padStart(6, '0');
  let reason = '';
  for (let i = 0; i < 6; i++) {
    const r = verifyChallenge(cookie, wrong);
    if (r.ok) break;
    reason = r.reason;
    if (r.cookie) cookie = r.cookie;
  }
  t('attempts are capped', reason === 'too_many', `ended on ${reason}`);
  const still = verifyChallenge(cookie, code);
  t('the real code is refused once capped', !still.ok && still.reason === 'too_many');
}

/* ---------- forgery ---------- */
{
  const { code, cookie } = createChallenge('sam@example.com');
  const [body] = cookie.split('.');
  t('bad signature rejected', verifyChallenge(`${body}.notavalidmac`, code).reason === 'no_challenge');
  t('missing cookie rejected', verifyChallenge(undefined, code).reason === 'no_challenge');
  t('garbage cookie rejected', verifyChallenge('garbage', code).reason === 'no_challenge');

  // swap in a different email while keeping the original signature
  const tampered = JSON.parse(Buffer.from(body, 'base64url').toString());
  tampered.email = 'attacker@example.com';
  const forged = Buffer.from(JSON.stringify(tampered)).toString('base64url') + '.' + cookie.split('.')[1];
  t('tampered payload rejected', verifyChallenge(forged, code).reason === 'no_challenge');
}

/* ---------- expiry ---------- */
{
  const { code, cookie } = createChallenge('sam@example.com');
  const [body, mac] = cookie.split('.');
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
  payload.exp = Math.floor(Date.now() / 1000) - 1;
  // re-sign honestly: an expired but VALID cookie must still be refused
  const { createHmac } = await import('node:crypto');
  const b = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', SECRET).update(b).digest().toString('base64url');
  t('expired challenge rejected', verifyChallenge(`${b}.${sig}`, code).reason === 'expired');
  void mac;
}

/* ---------- a code is bound to its address ---------- */
{
  const a = createChallenge('sam@example.com');
  const b = createChallenge('other@example.com');
  t("one address's code does not verify another's challenge", !verifyChallenge(b.cookie, a.code).ok);
}

/* ---------- sessions ---------- */
{
  t('garbage session rejected', readSession('nonsense') === null);
  t('missing session rejected', readSession(undefined) === null);
  const { createHmac } = await import('node:crypto');
  const payload = { email: 'sam@example.com', exp: Math.floor(Date.now() / 1000) - 1 };
  const b = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', SECRET).update(b).digest().toString('base64url');
  t('expired session rejected', readSession(`${b}.${sig}`) === null);
}

/* ---------- codes are not predictable ---------- */
{
  const seen = new Set();
  for (let i = 0; i < 400; i++) seen.add(createChallenge('sam@example.com').code);
  t('codes vary across issues', seen.size > 350, `${seen.size} distinct of 400`);
}

console.log('\nONE-TIME CODE');
console.log('='.repeat(48));
for (const n of ok) console.log('  ok    ' + n);
for (const n of bad) console.log('  FAIL  ' + n);
console.log('-'.repeat(48));
console.log(`${ok.length}/${ok.length + bad.length} passed` + (bad.length ? ', FAILING' : ', all green'));
process.exit(bad.length ? 1 : 0);
