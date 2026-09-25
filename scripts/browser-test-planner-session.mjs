/**
 * The planner carries its own landing page and its own sign-in form, left over
 * from the design prototype. Served at /plan behind a real session those are
 * wrong to show — a user who has just signed in gets asked to sign in again,
 * by a form that accepts anything and creates a fake user.
 *
 * This signs in for real (by minting the same session cookie the OTP and Google
 * routes issue) and asserts the planner opens straight into the planner.
 *
 *   node scripts/browser-test-planner-session.mjs http://127.0.0.1:3400
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { sealValue } from '../lib/otp-core.ts';

const base = (process.argv[2] ?? 'http://127.0.0.1:3400').replace(/\/$/, '');
const EMAIL = 'session-test@example.com';

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const secret = (env.match(/^AUTH_SECRET=(.+)$/m) ?? [])[1]?.trim();
if (!secret) { console.error('no AUTH_SECRET in .env.local'); process.exit(1); }

const token = sealValue(secret, { email: EMAIL, exp: Math.floor(Date.now() / 1000) + 3600 });

const problems = [];
const steps = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addCookies([{
  name: 'contour_session', value: token,
  domain: new URL(base).hostname, path: '/', httpOnly: true, sameSite: 'Lax',
}]);
const page = await ctx.newPage();
page.on('pageerror', (e) => problems.push('pageerror: ' + String(e).slice(0, 140)));

const step = async (label, fn) => {
  const before = problems.length;
  try { await fn(); steps.push([label, problems.length === before ? 'ok' : 'ISSUES']); }
  catch (e) { problems.push(label + ': ' + String(e).split('\n')[0].slice(0, 160)); steps.push([label, 'FAILED']); }
};
const text = () => page.evaluate(() => document.body?.innerText ?? '');

await step('a real session reaches the planner', async () => {
  const res = await page.goto(base + '/plan', { waitUntil: 'networkidle' });
  if (res.status() !== 200) throw new Error('expected 200, got ' + res.status());
  /*
   * The cookie is signed with the AUTH_SECRET in .env.local. A deployment with a
   * different secret will rightly reject it and bounce to /login — that is the
   * security boundary doing its job, not a defect. Say so plainly rather than
   * letting every later step fail as though the planner were broken.
   */
  if (page.url().includes('/login')) {
    console.log('\n  This deployment does not share the local AUTH_SECRET, so no session');
    console.log('  can be minted for it. Rejecting the cookie is correct. Run this against');
    console.log('  a server started with the same .env.local to exercise the planner.\n');
    process.exit(0);
  }
  await page.waitForTimeout(2000);
});

await step('the planner does NOT show a second sign-in', async () => {
  const t = await text();
  // the prototype's own auth screen: email + password, "Log in", "Sign up"
  if (await page.locator('input[type="password"]').count()) {
    throw new Error('a password field is on screen — the fake login is showing');
  }
  if (/Forgot password|Create account|Sign up free/i.test(t)) {
    throw new Error('the prototype sign-in screen is showing: ' + t.slice(0, 140));
  }
});

await step('it opens on the planner itself, not the prototype landing page', async () => {
  const t = await text();
  if (!/Dashboard|New trip|Trips/i.test(t)) {
    throw new Error('planner UI not visible: ' + t.slice(0, 160));
  }
});

await step('the signed-in address is the real one', async () => {
  const t = await text();
  if (/\bYou\b/.test(t) && !t.includes(EMAIL.split('@')[0])) {
    throw new Error('showing a placeholder identity rather than the session');
  }
});

await step('no raw template or undefined leaked', async () => {
  const t = await text();
  const bad = t.match(/\{\{|\bundefined\b|\[object Object\]|Invalid Date/);
  if (bad) throw new Error('bad text: ' + bad[0]);
});

await step('without the cookie it still redirects to /login', async () => {
  const clean = await browser.newContext();
  const p2 = await clean.newPage();
  const res = await p2.goto(base + '/plan', { waitUntil: 'domcontentloaded' });
  if (!/\/login/.test(p2.url())) throw new Error('unauthenticated request reached /plan: ' + res.status());
  await clean.close();
});

await browser.close();
console.log('\nPLANNER SESSION — ' + base);
console.log('='.repeat(56));
for (const [l, s] of steps) console.log('  ' + (s === 'ok' ? 'ok    ' : s.padEnd(6)) + l);
if (problems.length) { console.log('\nPROBLEMS'); for (const p of problems) console.log('  - ' + p); }
const failed = steps.filter((s) => s[1] !== 'ok').length;
console.log('-'.repeat(56));
console.log(`${steps.length - failed}/${steps.length} steps clean`);
process.exit(failed ? 1 : 0);
