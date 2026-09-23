/**
 * Real browser test. Serves the app, drives it with Chromium, and records what
 * a person would actually hit: console errors, unhandled rejections, failed
 * requests, horizontal overflow at each breakpoint, and template syntax or
 * undefined/NaN leaking into visible text.
 *
 *   node scripts/browser-test.mjs [--url http://...] [--shots]
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../public', import.meta.url));
const SHOTS = fileURLToPath(new URL('../.browser-shots', import.meta.url));
const args = process.argv.slice(2);
const wantShots = args.includes('--shots');
const externalUrl = args.includes('--url') ? args[args.indexOf('--url') + 1] : null;

const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };

/** Minimal static server so the page runs on a real origin, not file://. */
function serve() {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const file = normalize(join(ROOT, p));
      if (!file.startsWith(ROOT) || !existsSync(file)) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
      res.end(await readFile(file));
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const problems = [];
const note = (where, what) => problems.push(`${where}: ${what}`);

const BAD_TEXT = /\{\{|\bundefined\b|\bNaN\b|Invalid Date|\[object Object\]/;
const IGNORABLE = /favicon|ERR_ABORTED|net::ERR_FAILED.*favicon/i;

async function visibleText(page) {
  return page.evaluate(() => document.body?.innerText ?? '');
}

async function run() {
  const { server, port } = externalUrl ? { server: null, port: 0 } : await serve();
  const base = externalUrl ?? `http://127.0.0.1:${port}/prototype/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORABLE.test(m.text())) note('console', m.text().slice(0, 160));
  });
  page.on('pageerror', (e) => note('pageerror', String(e).slice(0, 160)));
  page.on('requestfailed', (r) => {
    const f = r.failure()?.errorText ?? '';
    if (!IGNORABLE.test(r.url() + f)) note('request failed', r.url().slice(0, 100) + ' — ' + f);
  });

  console.log('opening ' + base);
  await page.goto(base, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(1500);

  const steps = [];
  const step = async (label, fn) => {
    const before = problems.length;
    try {
      await fn();
      await page.waitForTimeout(500);
      const txt = await visibleText(page);
      if (BAD_TEXT.test(txt)) {
        note(label, 'visible text contains ' + (txt.match(BAD_TEXT) ?? [''])[0]);
      }
      if (wantShots) {
        await page.screenshot({ path: join(SHOTS, label.replace(/[^a-z0-9]+/gi, '-') + '.png'), fullPage: false });
      }
      steps.push([label, problems.length === before ? 'ok' : 'ISSUES']);
    } catch (e) {
      note(label, 'threw: ' + String(e).split('\n')[0].slice(0, 140));
      steps.push([label, 'FAILED']);
    }
  };

  const click = async (text) => {
    const el = page.getByText(text, { exact: false }).first();
    await el.click({ timeout: 10_000 });
  };

  await step('landing renders', async () => {
    const t = await visibleText(page);
    if (!/Plan your entire trip|Contour/i.test(t)) throw new Error('landing copy missing');
  });

  await step('sign up', async () => {
    await click('Create my trip');
    await page.waitForTimeout(400);
    await page.locator('input[type="email"]').first().fill('tester@example.com');
    await page.locator('input[type="password"]').first().fill('longenough1');
    const name = page.locator('input').first();
    if (await name.count()) await name.fill('Test User');
    await click('Create account');
  });

  await step('dashboard empty state', async () => {
    const t = await visibleText(page);
    if (!/No trips yet|Create my first trip/i.test(t)) throw new Error('expected empty dashboard');
  });

  await step('create trip wizard', async () => {
    await click('+ New trip');
    await page.waitForTimeout(400);
    const inputs = page.locator('input');
    await inputs.nth(0).fill('Darjeeling hills');
    await inputs.nth(1).fill('Kolkata');
    await inputs.nth(2).fill('Darjeeling');
    await page.locator('input[type="date"]').nth(0).fill('2027-03-10');
    await page.locator('input[type="date"]').nth(1).fill('2027-03-13');
    await click('Continue');
    await page.waitForTimeout(300);
    await click('Car');
    await click('Continue');
    await page.waitForTimeout(300);
    await click('Continue');
    await page.waitForTimeout(300);
    await click('Continue');
  });

  await step('generate itinerary', async () => {
    await click('Generate my itinerary');
    await page.waitForTimeout(8000); // 12 steps at 540ms plus settle
    const t = await visibleText(page);
    if (!/ready|Open the itinerary/i.test(t)) throw new Error('generation did not finish');
    await click('Open the itinerary');
  });

  await step('itinerary shows days', async () => {
    const t = await visibleText(page);
    if (/No itinerary yet/i.test(t)) throw new Error('itinerary still empty after generate');
    if (!/Day 1/i.test(t)) throw new Error('no day cards');
  });

  for (const [label, nav] of [
    ['map', 'Map'], ['stays', 'Stays'], ['food', 'Food'], ['sightseeing', 'Sightseeing'],
    ['budget', 'Budget'], ['expenses', 'Expenses'], ['packing', 'Packing'],
    ['saved places', 'Saved places'], ['assistant', 'AI assistant'], ['profile', 'Profile'],
  ]) {
    await step('screen: ' + label, async () => { await click(nav); });
  }

  await step('dark mode', async () => {
    await click('Dark');
    await page.waitForTimeout(400);
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const m = bg.match(/\d+/g)?.map(Number) ?? [255, 255, 255];
    if (m[0] > 100) throw new Error('dark mode did not darken the background: ' + bg);
  });
  await step('back to light', async () => { await click('Light'); });

  // §26 responsive widths
  for (const w of [320, 375, 390, 430, 768, 1024, 1280, 1440, 1920]) {
    await step('responsive ' + w + 'px', async () => {
      await page.setViewportSize({ width: w, height: 900 });
      await page.waitForTimeout(350);
      const over = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (over > 2) throw new Error('horizontal overflow of ' + over + 'px');
    });
  }

  await browser.close();
  if (server) server.close();

  console.log('\nBROWSER TEST' + (externalUrl ? ' — ' + externalUrl : ' — local prototype'));
  console.log('='.repeat(52));
  for (const [label, status] of steps) {
    console.log('  ' + (status === 'ok' ? 'ok    ' : status.padEnd(6)) + label);
  }
  if (problems.length) {
    console.log('\nPROBLEMS (' + problems.length + ')');
    for (const p of problems) console.log('  - ' + p);
  }
  const failed = steps.filter((s) => s[1] !== 'ok').length;
  console.log('-'.repeat(52));
  console.log(`${steps.length - failed}/${steps.length} steps clean, ${problems.length} problem(s)`);
  process.exit(failed || problems.length ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
