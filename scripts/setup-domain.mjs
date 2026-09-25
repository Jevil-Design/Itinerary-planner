/**
 * Sets up a sending subdomain so the one-time code can reach any address, not
 * just the Resend account owner's.
 *
 *   node scripts/setup-domain.mjs <full-access-resend-key> [subdomain]
 *
 * Creates the domain in Resend, prints the DNS records to add, waits for them
 * to appear in public DNS, then asks Resend to verify. The DNS records are the
 * one part nobody can automate — they have to be added wherever the domain is
 * managed.
 *
 * A subdomain deliberately: primarc.in already publishes an SPF record ending
 * in -all for Microsoft 365 and Zoho. Sending from a subdomain leaves that
 * record, and the deliverability of ordinary company mail, completely alone.
 */
import { resolve4, resolveMx, resolveTxt } from 'node:dns/promises';

const [key, domainArg] = process.argv.slice(2);
const domain = domainArg?.trim() || 'send.primarc.in';

const die = (m) => { console.error('\n  ' + m + '\n'); process.exit(1); };
if (!key) {
  console.log(`
Usage: node scripts/setup-domain.mjs <full-access-resend-key> [subdomain]

The sending key cannot create domains. Make a second key for this:
  resend.com -> API Keys -> Create API Key -> permission "Full access"

Use it once, here, then delete it. The app never needs it — it only ever uses
the send-only key.
`);
  process.exit(1);
}
if (!/^re_/.test(key)) die('Resend keys start with re_.');

const api = async (path, init = {}) => {
  const res = await fetch('https://api.resend.com' + path, {
    ...init,
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', ...init.headers },
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
};

// --- find or create -----------------------------------------------------------
let record = null;
const existing = await api('/domains');
if (existing.status === 401 || /restricted/i.test(existing.body?.message ?? '')) {
  die('That key cannot manage domains. Create one with "Full access" permission.');
}
record = (existing.body?.data ?? []).find((d) => d.name === domain) ?? null;

if (record) {
  console.log(`\n  ${domain} already exists in Resend (status: ${record.status})`);
  record = (await api('/domains/' + record.id)).body;
} else {
  console.log(`\n--- creating ${domain} ---`);
  const created = await api('/domains', {
    method: 'POST',
    body: JSON.stringify({ name: domain, region: 'ap-northeast-1' }),
  });
  if (!created.ok) die(`Resend refused: ${JSON.stringify(created.body).slice(0, 300)}`);
  record = created.body;
  console.log('  created, region ' + record.region);
}

// --- the records a human has to add ------------------------------------------
const records = record.records ?? [];
console.log('\n' + '='.repeat(78));
console.log('ADD THESE DNS RECORDS WHERE ' + domain.split('.').slice(1).join('.') + ' IS MANAGED');
console.log('='.repeat(78));
for (const r of records) {
  console.log(`\n  Type:  ${r.type}`);
  console.log(`  Name:  ${r.name}`);
  console.log(`  Value: ${r.value}`);
  if (r.priority !== undefined && r.priority !== null) console.log(`  Priority: ${r.priority}`);
  if (r.ttl) console.log(`  TTL:   ${r.ttl}`);
}
console.log('\n' + '='.repeat(78));
console.log(`
  These touch ${domain} only. The SPF and MX records on
  ${domain.split('.').slice(1).join('.')} itself are not modified, so company email is unaffected.
`);

// --- wait for DNS, then verify ------------------------------------------------
const seen = async (r) => {
  const host = r.name.endsWith('.') ? r.name.slice(0, -1) : r.name;
  try {
    if (r.type === 'MX') return (await resolveMx(host)).length > 0;
    if (r.type === 'TXT') {
      const all = (await resolveTxt(host)).map((t) => t.join(''));
      // DKIM values are long and providers sometimes re-split them; compare a
      // distinctive slice rather than demanding an exact string match.
      return all.some((t) => t.includes(r.value.slice(0, 40)) || r.value.includes(t.slice(0, 40)));
    }
    return (await resolve4(host)).length > 0;
  } catch { return false; }
};

console.log('  Waiting for the records to appear in public DNS (Ctrl-C to stop and rerun later)...\n');
const started = Date.now();
while (Date.now() - started < 20 * 60_000) {
  const states = await Promise.all(records.map(seen));
  const found = states.filter(Boolean).length;
  const mins = Math.round((Date.now() - started) / 60000);
  console.log(`  [${String(mins).padStart(2)}m] ${found}/${records.length} records visible`);
  if (found === records.length) break;
  await new Promise((r) => setTimeout(r, 30_000));
}

console.log('\n--- asking Resend to verify ---');
const v = await api(`/domains/${record.id}/verify`, { method: 'POST' });
if (!v.ok) die(`Verify failed: ${JSON.stringify(v.body).slice(0, 300)}`);

for (let i = 0; i < 20; i++) {
  const now = (await api('/domains/' + record.id)).body;
  console.log(`  status: ${now.status}`);
  if (now.status === 'verified') {
    console.log(`\n  ${domain} is verified. Point the app at it:\n`);
    console.log(`    npm run setup:email -- <send-only-key> <any-email> "Contour <login@${domain}>"\n`);
    console.log('  Then delete the full-access key in Resend — it is not needed again.\n');
    process.exit(0);
  }
  if (now.status === 'failed') die('Resend could not verify the records. Check them against the table above.');
  await new Promise((r) => setTimeout(r, 15_000));
}
console.log('\n  Still pending. DNS can take a few hours; rerun this to pick up where it left off.\n');
