/**
 * Produces public/prototype/ from the design file.
 *
 * Two things differ from the .dc.html, and both have bitten before:
 *
 *  1. A <title>, which the design file has none of.
 *  2. An ABSOLUTE script path. The design file says "./support.js" so it opens
 *     straight from disk, but Next strips the trailing slash from /prototype/,
 *     so a relative path resolves to /support.js — which 404s and returns the
 *     HTML error page. The browser then refuses the script for its MIME type,
 *     the runtime never boots, and the visitor sees the raw {{ }} template.
 *
 * Run it after any change to the design file:
 *   node scripts/build-prototype.mjs
 */
import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const SRC = fileURLToPath(new URL('Contour - AI Travel Itinerary Builder.dc.html', root));
const RUNTIME = fileURLToPath(new URL('support.js', root));
const OUT_DIR = fileURLToPath(new URL('public/prototype/', root));
const OUT = OUT_DIR + 'index.html';

const TITLE = '<title>Contour — AI Travel Itinerary Builder</title>';

let html = await readFile(SRC, 'utf8');

if (!html.includes('<script src="./support.js"></script>')) {
  console.error('the design file no longer references ./support.js — check before publishing');
  process.exit(1);
}

html = html.replace(
  '<script src="./support.js"></script>',
  `${TITLE}\n<script src="/prototype/support.js"></script>`,
);

await mkdir(OUT_DIR, { recursive: true });
await writeFile(OUT, html);
await copyFile(RUNTIME, OUT_DIR + 'support.js');

const checks = [
  ['has a title', html.includes(TITLE)],
  ['script path is absolute', html.includes('src="/prototype/support.js"')],
  ['no relative script path left', !html.includes('"./support.js"')],
];
for (const [label, pass] of checks) console.log((pass ? '  ok    ' : '  FAIL  ') + label);
if (checks.some(([, p]) => !p)) process.exit(1);
console.log('  built public/prototype/ (' + Math.round(html.length / 1024) + ' KB)');
