/**
 * Builds app/imagery.json: real, openly licensed destination photographs from
 * Wikimedia Commons, with the subject and licence recorded for each.
 *
 * Wikimedia rather than an Unsplash photo id because Commons tells us what the
 * picture actually shows. Pasting an id from memory into a hero slot is a bet
 * on what it depicts; this is not.
 *
 * Only permissive licences are kept, and every entry carries its attribution so
 * the credit line can be rendered.
 *
 *   node scripts/fetch-imagery.mjs
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../app/imagery.json', import.meta.url));

const WANTED = [
  { key: 'darjeeling', search: 'Darjeeling tea garden landscape', label: 'Darjeeling, West Bengal' },
  { key: 'sikkim', search: 'Kangchenjunga Sikkim mountain', label: 'Sikkim' },
  { key: 'goa', search: 'Palolem beach Goa', label: 'Goa' },
  { key: 'jaipur', search: 'Hawa Mahal Jaipur', label: 'Jaipur, Rajasthan' },
  { key: 'kerala', search: 'Kerala backwaters houseboat', label: 'Kerala' },
  { key: 'ladakh', search: 'Pangong Lake Ladakh', label: 'Ladakh' },
  { key: 'hampi', search: 'Hampi Virupaksha temple', label: 'Hampi, Karnataka' },
  { key: 'munnar', search: 'Munnar tea plantation Kerala', label: 'Munnar, Kerala' },
  { key: 'varanasi', search: 'Varanasi ghats Ganges', label: 'Varanasi, Uttar Pradesh' },
  { key: 'andaman', search: 'Radhanagar Beach Havelock', label: 'Andaman Islands' },
];

/** Licences we are willing to ship. Anything else is dropped rather than risked. */
const OK_LICENCE = /^(CC0|CC BY|CC BY-SA|Public domain|PDM)/i;

const api = (params) =>
  'https://commons.wikimedia.org/w/api.php?' +
  new URLSearchParams({ format: 'json', formatversion: '2', origin: '*', ...params });

async function findImage({ key, search, label }) {
  const url = api({
    action: 'query',
    prop: 'imageinfo',
    iiprop: 'url|extmetadata|size',
    iiurlwidth: '1600',
    generator: 'search',
    gsrsearch: `filetype:bitmap ${search}`,
    gsrlimit: '8',
    gsrnamespace: '6',
  });

  const res = await fetch(url, { headers: { 'user-agent': 'contour-imagery/1.0 (build script)' } });
  if (!res.ok) throw new Error(`${key}: HTTP ${res.status}`);
  const json = await res.json();
  const pages = json.query?.pages ?? [];

  for (const page of pages) {
    const info = page.imageinfo?.[0];
    if (!info) continue;
    const meta = info.extmetadata ?? {};
    const licence = meta.LicenseShortName?.value ?? '';
    if (!OK_LICENCE.test(licence)) continue;
    // landscape only — these are hero and card slots
    if (!info.width || !info.height || info.width / info.height < 1.3) continue;

    const strip = (s) => (s ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    return {
      key,
      label,
      title: page.title.replace(/^File:/, ''),
      src: info.thumburl ?? info.url,
      width: info.thumbwidth ?? info.width,
      height: info.thumbheight ?? info.height,
      licence,
      author: strip(meta.Artist?.value).slice(0, 80) || 'Unknown',
      page: info.descriptionurl ?? '',
    };
  }
  return null;
}

const results = [];
for (const want of WANTED) {
  try {
    const found = await findImage(want);
    if (found) {
      results.push(found);
      console.log(`  ok    ${want.key.padEnd(12)} ${found.licence.padEnd(12)} ${found.title.slice(0, 48)}`);
    } else {
      console.log(`  none  ${want.key.padEnd(12)} no permissively licensed landscape found`);
    }
  } catch (e) {
    console.log(`  FAIL  ${want.key.padEnd(12)} ${e.message}`);
  }
}

if (results.length < 4) {
  console.error(`\nonly ${results.length} images resolved — too few to build the page on`);
  process.exit(1);
}

await writeFile(OUT, JSON.stringify({ fetched: new Date().toISOString(), images: results }, null, 2) + '\n');
console.log(`\n  wrote app/imagery.json with ${results.length} images`);
