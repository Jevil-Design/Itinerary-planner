/**
 * Browser test for the Next.js application's public surface: the landing page,
 * the auth handler, the preserved prototype at /prototype, and every viewport
 * width in §26. Authenticated screens need STACK_SECRET_SERVER_KEY and are
 * reported as blocked rather than silently skipped.
 *
 *   node scripts/browser-test-app.mjs http://127.0.0.1:3200
 */
import { chromium } from 'playwright';

const base = (process.argv[2] ?? 'http://127.0.0.1:3200').replace(/\/$/, '');
const problems = [];
const steps = [];
const IGNORABLE = /favicon|_next\/static\/media|ERR_ABORTED/i;
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
  catch (e) { problems.push(label + ': ' + String(e).split('\n')[0].slice(0, 140)); steps.push([label, 'FAILED']); }
};

const text = () => page.evaluate(() => document.body?.innerText ?? '');

await step('landing renders', async () => {
  await page.goto(base + '/', { waitUntil: 'networkidle', timeout: 60_000 });
  const t = await text();
  if (!/Plan your entire trip with AI/.test(t)) throw new Error('hero copy missing');
  if (BAD_TEXT.test(t)) throw new Error('bad text: ' + (t.match(BAD_TEXT) ?? [''])[0]);
});

await step('landing shows the generation pipeline, not a fake trip', async () => {
  const t = await text();
  if (!/Trip details validated/.test(t)) throw new Error('pipeline list missing');
  if (/Rinchenpong|1,430/.test(t)) throw new Error('old fabricated hero is back');
});

await step('sign-in page renders', async () => {
  await page.goto(base + '/handler/sign-in', { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(1500);
});

await step('protected route redirects to sign-in', async () => {
  const res = await page.goto(base + '/trips', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  if (!/handler\/sign-in|handler/.test(page.url())) throw new Error('did not redirect, landed on ' + page.url());
  void res;
});

await step('prototype still served at /prototype', async () => {
  await page.goto(base + '/prototype', { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(1500);
  const t = await text();
  if (!/Contour/.test(t)) throw new Error('prototype did not render');
  if (BAD_TEXT.test(t)) throw new Error('bad text: ' + (t.match(BAD_TEXT) ?? [''])[0]);
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
  if (/npg_|neondb_owner|ssk_|DATABASE_URL/.test(html)) throw new Error('secret in page source');
});

for (const w of [320, 375, 390, 430, 768, 1024, 1280, 1440, 1920]) {
  await step('responsive ' + w + 'px', async () => {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(base + '/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (over > 2) throw new Error('horizontal overflow of ' + over + 'px');
  });
}

await step('keyboard focus is visible on the primary action', async () => {
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

console.log('\nBROWSER TEST — Next.js app at ' + base);
console.log('='.repeat(52));
for (const [l, s] of steps) console.log('  ' + (s === 'ok' ? 'ok    ' : s.padEnd(6)) + l);
if (problems.length) { console.log('\nPROBLEMS (' + problems.length + ')'); for (const p of problems) console.log('  - ' + p); }
const failed = steps.filter((s) => s[1] !== 'ok').length;
console.log('-'.repeat(52));
console.log(`${steps.length - failed}/${steps.length} steps clean, ${problems.length} problem(s)`);
console.log('\nBLOCKED (needs STACK_SECRET_SERVER_KEY): sign-up, sign-in, Google OAuth,');
console.log('session persistence, create trip, generate, and every authenticated screen.');
process.exit(failed ? 1 : 0);
