/**
 * Tests the Google sign-in logic. Nothing is stored, so the signed state cookie
 * carries the CSRF nonce and the PKCE verifier — which makes it, like the OTP
 * challenge, the security boundary. It gets the same treatment.
 *
 *   node --experimental-strip-types scripts/verify-oauth.mjs
 */
import { createHash } from 'node:crypto';

const SECRET = 'test-secret-'.padEnd(64, 'x');
const CLIENT = '1234.apps.googleusercontent.com';

const core = await import('../lib/oauth-core.ts');
const { sealValue } = await import('../lib/otp-core.ts');

const ok = [];
const bad = [];
const t = (n, pass, extra) => (pass ? ok : bad).push(n + (extra ? `  [${extra}]` : ''));

const idToken = (claims) =>
  [
    Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url'),
    Buffer.from(JSON.stringify(claims)).toString('base64url'),
    'signature-not-checked-see-comment',
  ].join('.');

const valid = (over = {}) => ({
  iss: 'https://accounts.google.com',
  aud: CLIENT,
  exp: Math.floor(Date.now() / 1000) + 600,
  email: 'Sam@Example.com',
  email_verified: true,
  ...over,
});

/* ---------- PKCE ---------- */
{
  const { verifier, challenge } = core.createPkce();
  t('verifier is high entropy', verifier.length >= 40, `${verifier.length} chars`);
  const expected = createHash('sha256').update(verifier).digest().toString('base64url');
  t('challenge is S256 of the verifier', challenge === expected);
  t('two verifiers differ', core.createPkce().verifier !== verifier);
}

/* ---------- state ---------- */
{
  const { state, cookie, pkce } = core.createState(SECRET, '/plan');
  const r = core.checkState(SECRET, cookie, state);
  t('matching state passes', r.ok === true);
  t('the verifier comes back for the token exchange', r.ok && r.verifier === pkce.verifier);
  t('the return path comes back', r.ok && r.next === '/plan');

  t('wrong state rejected', core.checkState(SECRET, cookie, 'not-the-nonce').reason === 'mismatch');
  t('absent state rejected', core.checkState(SECRET, cookie, null).reason === 'mismatch');
  t('missing cookie rejected', core.checkState(SECRET, undefined, state).reason === 'missing');
  t('forged cookie rejected', core.checkState(SECRET, 'a.b', state).reason === 'missing');
  t('cookie from another secret rejected',
    core.checkState('other-secret-'.padEnd(64, 'y'), cookie, state).reason === 'missing');
}

/* ---------- the verifier must not be guessable from the cookie ---------- */
{
  const { cookie, pkce } = core.createState(SECRET);
  const body = Buffer.from(cookie.split('.')[0], 'base64url').toString();
  // it IS in the cookie — that is the design — but the cookie is signed and HttpOnly,
  // so assert it cannot be modified rather than that it is absent
  t('state cookie is signed against tampering', (() => {
    const p = JSON.parse(body);
    p.verifier = 'attacker-chosen';
    const forged = Buffer.from(JSON.stringify(p)).toString('base64url') + '.' + cookie.split('.')[1];
    return core.checkState(SECRET, forged, p.nonce).ok === false;
  })(), `verifier len ${pkce.verifier.length}`);
}

/* ---------- expiry ---------- */
{
  const { state } = core.createState(SECRET);
  const expired = sealValue(SECRET, {
    nonce: state, verifier: 'v', next: '/plan', exp: Math.floor(Date.now() / 1000) - 1,
  });
  t('expired state rejected', core.checkState(SECRET, expired, state).reason === 'expired');
}

/* ---------- open redirect ---------- */
{
  for (const [input, why] of [
    ['https://evil.example/steal', 'absolute url'],
    ['//evil.example/steal', 'protocol relative'],
    ['javascript:alert(1)', 'javascript scheme'],
  ]) {
    const { state, cookie } = core.createState(SECRET, input);
    const r = core.checkState(SECRET, cookie, state);
    t(`next is not an open redirect — ${why}`, r.ok && r.next === '/plan', r.ok ? r.next : '');
  }
  const { state, cookie } = core.createState(SECRET, '/plan?x=1');
  const r = core.checkState(SECRET, cookie, state);
  t('a same-site path is preserved', r.ok && r.next === '/plan?x=1');
}

/* ---------- authorize url ---------- */
{
  const url = new URL(core.authorizeUrl({
    clientId: CLIENT, redirectUri: 'https://x.test/api/auth/google/callback',
    state: 'nonce', challenge: 'chal',
  }));
  const q = url.searchParams;
  t('authorize url points at Google', url.origin === 'https://accounts.google.com');
  t('asks only for openid email', q.get('scope') === 'openid email');
  t('uses PKCE S256', q.get('code_challenge_method') === 'S256' && q.get('code_challenge') === 'chal');
  t('asks for a code', q.get('response_type') === 'code');
  t('does not request offline access', q.get('access_type') === 'online');
  t('carries the state', q.get('state') === 'nonce');
}

/* ---------- id token claims ---------- */
{
  const good = core.readIdToken(idToken(valid()), CLIENT);
  t('valid token yields the email', !('error' in good) && good.email === 'sam@example.com');
  t('email is lowercased', !('error' in good) && good.email === good.email.toLowerCase());

  const cases = [
    ['token for another client rejected', valid({ aud: 'someone-else' })],
    ['wrong issuer rejected', valid({ iss: 'https://evil.example' })],
    ['expired token rejected', valid({ exp: Math.floor(Date.now() / 1000) - 5 })],
    ['unverified email rejected', valid({ email_verified: false })],
    ['token with no email rejected', valid({ email: undefined })],
  ];
  for (const [label, claims] of cases) {
    t(label, 'error' in core.readIdToken(idToken(claims), CLIENT));
  }
  t('malformed token rejected', 'error' in core.readIdToken('not.a.jwt.at.all', CLIENT));
  t('garbage token rejected', 'error' in core.readIdToken('garbage', CLIENT));
  t('accounts.google.com issuer also accepted',
    !('error' in core.readIdToken(idToken(valid({ iss: 'accounts.google.com' })), CLIENT)));
}

console.log('\nGOOGLE SIGN-IN');
console.log('='.repeat(52));
for (const n of ok) console.log('  ok    ' + n);
for (const n of bad) console.log('  FAIL  ' + n);
console.log('-'.repeat(52));
console.log(`${ok.length}/${ok.length + bad.length} passed` + (bad.length ? ', FAILING' : ', all green'));
process.exit(bad.length ? 1 : 0);
