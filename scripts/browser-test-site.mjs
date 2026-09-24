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

await step('planner is gated', async () => {
  await page.goto(base + '/plan', { waitUntil: 'domcontentloaded' });
  if (!/\/login/.test(page.url())) throw new Error('reached /plan without a session: ' + page.url());
});

await step('code request reports missing email config honestly', async () => {
  await page.goto(base + '/login', { waitUntil: 'networkidle' });
  await page.locator('input[type="email"]').fill('tester@example.com');
  await page.getByRole('button', { name: /send code/i }).click();
  await page.waitForTimeout(1200);
  const t = await text();
  // with no RESEND_API_KEY the honest answer is that delivery is unconfigured
  if (!/not configured|could not be sent/i.test(t)) {
    throw new Error('no clear message about email delivery: ' + t.slice(0, 120));
  }
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
