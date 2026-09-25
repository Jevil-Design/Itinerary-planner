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
const IGNORABLE = /favicon|_next\/static\/media|ERR_ABORTED|status of (4\d\d|5\d\d)/i;
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

await step('Google button is server-rendered', async () => {
  const res = await fetch(base + '/login');
  const html = await res.text();
  // must be in the HTML, not injected after hydration
  if (!/Continue with Google/.test(html)) throw new Error('Google button missing from server HTML');
  if (!/Send code/.test(html)) throw new Error('email form missing from server HTML');
});

await step('Google start behaves correctly either way', async () => {
  const res = await fetch(base + '/api/auth/google/start', { redirect: 'manual' });
  const loc = res.headers.get('location') ?? '';
  if (res.status !== 303) throw new Error('expected 303, got ' + res.status);
  // Configured or not, both outcomes are valid; what must never happen is a
  // dead button — a 500, or a redirect to neither Google nor an explained error.
  const toGoogle = /accounts\.google\.com/.test(loc);
  const toError = /error=google_unconfigured/.test(loc);
  if (!toGoogle && !toError) throw new Error('unexpected redirect: ' + loc);
});

await step('the unconfigured message reaches the page', async () => {
  await page.goto(base + '/login?error=google_unconfigured', { waitUntil: 'networkidle' });
  const t = await text();
  if (!/not set up on this deployment/i.test(t)) throw new Error('message not shown: ' + t.slice(0, 120));
});

await step('OAuth redirect_uri matches the host being served', async () => {
  const res = await fetch(base + '/api/auth/google/start', { redirect: 'manual' });
  const loc = res.headers.get('location') ?? '';
  if (!/accounts.google.com/.test(loc)) return; // unconfigured here, covered above
  const redirect = new URL(loc).searchParams.get('redirect_uri') ?? '';
  // NEXT_PUBLIC_* is inlined at build time; if that ever creeps back in, this
  // catches it by comparing against the host actually answering the request.
  if (!redirect.startsWith(base)) {
    throw new Error('redirect_uri ' + redirect + ' does not match ' + base);
  }
});

await step('planner is gated', async () => {
  await page.goto(base + '/plan', { waitUntil: 'domcontentloaded' });
  if (!/\/login/.test(page.url())) throw new Error('reached /plan without a session: ' + page.url());
});

await step('code request answers honestly, whatever the email config', async () => {
  await page.goto(base + '/login', { waitUntil: 'networkidle' });
  await page.locator('input[type="email"]').fill('tester@example.com');
  await page.getByRole('button', { name: /send code/i }).click();
  await page.waitForTimeout(2500);
  const t = await text();
  // Three outcomes are all honest, and which one you get depends on the
  // deployment rather than on the code: no provider configured, the provider
  // refusing this recipient (the shared resend.dev sender only delivers to the
  // account owner), or the code genuinely going out. What must never happen is
  // claiming a code was sent when none was, or spilling a raw error.
  const unconfigured = /not configured|could not be sent/i.test(t);
  const refused = /could not send|not right|try again/i.test(t);
  const sent = /We sent a six-digit code/i.test(t);
  if (!unconfigured && !refused && !sent) {
    throw new Error('no clear outcome from the code request: ' + t.slice(0, 160));
  }
  if (/at Object\.|node_modules|\bstack\b/i.test(t)) throw new Error('raw error leaked to the page');
  if (/\b\d{6}\b/.test(t) && sent) throw new Error('a six-digit code is visible on the page');
});

await step('prototype planner still reachable', async () => {
  await page.goto(base + '/prototype', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const t = await text();
  if (!/Contour/.test(t)) throw new Error('prototype did not render');
  if (/\{\{/.test(t)) throw new Error('raw template visible');
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
  if (/AUTH_SECRET|RESEND_API_KEY|npg_|ssk_/.test(html)) throw new Error('secret in page source');
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
