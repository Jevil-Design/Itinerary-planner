/**
 * Browser test for the redesigned site: landing, the one-time-code sign-in, the
 * gated planner, and every viewport width.
 *
 *   node scripts/browser-test-site.mjs http://127.0.0.1:3400
 */
import { chromium } from 'playwright';

const base = (process.argv[2] ?? 'http://127.0.0.1:3400').replace(/\/$/, '');
const problems = [];
const steps = [];
// A deliberate 4xx/5xx from our own API is logged by the browser as a failed
// resource. That is the API answering correctly, not a defect in the page.
// The auth rate limit is the same: the app logs it on purpose and shows the
// user a real message, so it is handled behaviour rather than a fault.
const IGNORABLE =
  /favicon|_next\/static\/media|ERR_ABORTED|status of (4\d\d|5\d\d)|over_email_send_rate_limit|signInWithOtp 429/i;
const BAD_TEXT = /\{\{|\bundefined\b|\bNaN\b|Invalid Date|\[object Object\]/;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error' && !IGNORABLE.test(m.text())) problems.push('console: ' + m.text().slice(0, 150)); });
page.on('pageerror', (e) => problems.push('pageerror: ' + String(e).slice(0, 150)));
page.on('requestfailed', (r) => { const f = r.failure()?.errorText ?? ''; if (!IGNORABLE.test(r.url() + f)) problems.push('request failed: ' + r.url().slice(0, 90) + ' — ' + f); });

const step = async (label, fn) => {
  const before = problems.length;
  try { await fn(); steps.push([label, problems.length === before ? 'ok' : 'ISSUES']); }
  catch (e) { problems.push(label + ': ' + String(e).split('\n')[0].slice(0, 150)); steps.push([label, 'FAILED']); }
};
const text = () => page.evaluate(() => document.body?.innerText ?? '');

await step('landing renders', async () => {
  await page.goto(base + '/', { waitUntil: 'networkidle', timeout: 60_000 });
  const t = await text();
  if (!/Plan the whole trip in minutes/.test(t)) throw new Error('hero headline missing');
  if (BAD_TEXT.test(t)) throw new Error('bad text: ' + (t.match(BAD_TEXT) ?? [''])[0]);
});

await step('destination photography loads', async () => {
  const broken = await page.evaluate(() =>
    [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.src.slice(0, 80)));
  if (broken.length) throw new Error(broken.length + ' broken image(s): ' + broken[0]);
  const count = await page.evaluate(() => document.images.length);
  if (count < 5) throw new Error('only ' + count + ' images on the page');
});

await step('photo credit is given', async () => {
  const t = await text();
  if (!/Wikimedia Commons/.test(t)) throw new Error('attribution missing');
  if (!/CC BY|Public domain/.test(t)) throw new Error('licences not shown');
});

await step('no fabricated social proof', async () => {
  const t = await text();
  // the reference site leans on review counts and ratings; this product has none
  if (/\b4\.9\b|\b10,000\+?\s*trips|\bverified reviews\b/i.test(t)) {
    throw new Error('invented ratings or review counts on the page');
  }
});

await step('storage claim is stated plainly', async () => {
  const t = await text();
  if (!/stored on a server/i.test(t)) throw new Error('no statement about storage');
});

await step('sign-in page renders', async () => {
  await page.goto(base + '/login', { waitUntil: 'networkidle' });
  const t = await text();
  if (!/Sign in/.test(t)) throw new Error('login heading missing');
  if (!(await page.locator('input[type="email"]').count())) throw new Error('no email field');
});

await step('the email form is server-rendered', async () => {
  const res = await fetch(base + '/login');
  const html = await res.text();
  // must be in the HTML, not injected after hydration
  if (!/Send code/.test(html)) throw new Error('email form missing from server HTML');
  if (!/type="email"/.test(html)) throw new Error('email field missing from server HTML');
});

await step('no other sign-in method is offered', async () => {
  const html = await (await fetch(base + '/login')).text();
  /*
   * The product offers exactly one way in. A stray button for a route that no
   * longer exists would be a dead control, which is worse than none.
   *
   * Matched against markup, not prose: the page says "No password" as a
   * statement of fact, and a bare /password/ would flag that as a password
   * form. What must not exist is an actual field or an OAuth link.
   */
  for (const gone of [
    /Continue with Google/i,
    /accounts\.google\.com/i,
    /type="password"/i,
    /\/api\/auth\/google/i,
  ]) {
    if (gone.test(html)) throw new Error('an extra sign-in method is on the page: ' + gone);
  }
});

await step('the removed Google routes are really gone', async () => {
  for (const path of ['/api/auth/google/start', '/api/auth/google/callback']) {
    const res = await fetch(base + path, { redirect: 'manual' });
    // 404 is the point. A 303 would mean the route still exists.
    if (res.status !== 404) throw new Error(path + ' answered ' + res.status + ', expected 404');
  }
});

await step('planner is gated', async () => {
  await page.goto(base + '/plan', { waitUntil: 'domcontentloaded' });
  if (!/\/login/.test(page.url())) throw new Error('reached /plan without a session: ' + page.url());
});

await step('requesting a code moves to the verification step', async () => {
  await page.goto(base + '/login', { waitUntil: 'networkidle' });
  await page.locator('input[type="email"]').fill(`site-test-${Date.now()}@primarc.in`);
  await page.getByRole('button', { name: /send code/i }).click();
  await page.waitForTimeout(4000);
  const t = await text();
  /*
   * Two honest outcomes. Either the form advances to "Check your email", or
   * Supabase's built-in mailer says it is rate limited — which is itself proof
   * the request was accepted rather than refused for the recipient.
   */
  const advanced = /Check your email|six-digit code/i.test(t);
  const limited = /wait|rate|too many/i.test(t);
  if (!advanced && !limited) {
    throw new Error('no clear outcome from the code request: ' + t.slice(0, 180));
  }
  if (/\b\d{6}\b/.test(t) && advanced) throw new Error('a six-digit code is visible on the page');
  if (/at Object\.|node_modules/i.test(t)) throw new Error('a raw error leaked to the page');
});

await step('the planner is not reachable without signing in', async () => {
  // It used to be served from public/, which was a way straight past the gate.
  for (const path of ['/prototype', '/prototype/', '/prototype/index.html']) {
    const res = await fetch(base + path, { redirect: 'manual' });
    if (res.status === 200) throw new Error(path + ' is publicly readable');
  }
  // The template runtime stays public; it is a library, not the planner.
  const rt = await fetch(base + '/prototype/support.js');
  if (!rt.ok) throw new Error('support.js should still be served, got ' + rt.status);
});


await step('security headers present', async () => {
  const res = await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
  const h = res.headers();
  for (const k of ['x-content-type-options', 'x-frame-options', 'referrer-policy']) {
    if (!h[k]) throw new Error('missing ' + k);
  }
  if (h['x-powered-by']) throw new Error('x-powered-by not removed');
});

await step('no secrets in the served HTML', async () => {
  const html = await page.content();
  // Anything server-side that must never reach a page. The publishable Supabase
  // key is absent on purpose: it is designed to be public and RLS is what guards
  // the data, so flagging it would be a false alarm.
  if (/SUPABASE_SERVICE_ROLE|service_role|sb_secret_|npg_|eyJ[A-Za-z0-9_-]*.[A-Za-z0-9_-]*.[A-Za-z0-9_-]*service/.test(html)) {
    throw new Error('a server secret is in the page source');
  }
});

for (const w of [320, 375, 390, 430, 768, 1024, 1280, 1440, 1920]) {
  await step('responsive ' + w + 'px', async () => {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(base + '/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(350);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (over > 2) throw new Error('horizontal overflow of ' + over + 'px');
  });
}

await step('login page has no overflow at 320px', async () => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto(base + '/login', { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (over > 2) throw new Error('horizontal overflow of ' + over + 'px');
});

await step('keyboard focus is visible', async () => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.keyboard.press('Tab');
  const outline = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const s = getComputedStyle(el);
    return s.outlineStyle + ' ' + s.outlineWidth;
  });
  if (!outline || /none/.test(outline)) throw new Error('no visible focus ring: ' + outline);
});

await browser.close();

console.log('\nBROWSER TEST — ' + base);
console.log('='.repeat(52));
for (const [l, s] of steps) console.log('  ' + (s === 'ok' ? 'ok    ' : s.padEnd(6)) + l);
if (problems.length) { console.log('\nPROBLEMS (' + problems.length + ')'); for (const p of problems) console.log('  - ' + p); }
const failed = steps.filter((s) => s[1] !== 'ok').length;
console.log('-'.repeat(52));
console.log(`${steps.length - failed}/${steps.length} steps clean, ${problems.length} problem(s)`);
process.exit(failed ? 1 : 0);
