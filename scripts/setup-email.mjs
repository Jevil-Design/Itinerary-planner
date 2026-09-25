/**
 * Turns the emailed sign-in code on. The API key has to be created by hand at
 * resend.com because it belongs to an account, not to this repository;
 * everything after that is here.
 *
 *   node scripts/setup-email.mjs <resend-api-key> <your-email> ["From Name <addr>"]
 *
 * Sends a real test email before touching the deployment, so a bad key or a
 * sender Resend will not accept fails here rather than in front of a user.
 */
import { spawn } from 'node:child_process';

const SITE = process.env.SITE ?? 'https://itinerary-planner-virid.vercel.app';
// Resend's shared sender. It needs no DNS and no domain verification, but it
// will only deliver to the address that owns the Resend account.
const DEFAULT_FROM = 'Contour <onboarding@resend.dev>';
const [apiKey, testTo, fromArg] = process.argv.slice(2);
const from = fromArg?.trim() || DEFAULT_FROM;

const die = (msg) => { console.error('\n  ' + msg + '\n'); process.exit(1); };

if (!apiKey || !testTo) {
  console.log(`
Usage: node scripts/setup-email.mjs <resend-api-key> <your-email> ["From Name <addr>"]

  1. resend.com  ->  sign up (free tier is 3,000 emails a month)
  2. API Keys  ->  Create API Key  ->  permission "Sending access"
     Copy it now; Resend shows the full key exactly once.
  3. Run this with the key and the address you want to sign in as.

The sender defaults to ${DEFAULT_FROM}, which needs no DNS setup
but ONLY delivers to the address that owns the Resend account. To email anyone
else you must verify a domain (Resend -> Domains -> Add Domain, then add the
DNS records it gives you) and pass that address as the third argument.
`);
  process.exit(1);
}

if (!/^re_/.test(apiKey)) {
  die(`That does not look like a Resend key — they start with re_.
  Got: ${apiKey.slice(0, 12)}...`);
}
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(testTo)) die(`Not a valid email address: ${testTo}`);

// --- verify the key and the sender for real, before changing anything --------
console.log('\n--- sending a test email through Resend ---');
const probe = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
  body: JSON.stringify({
    from,
    to: testTo,
    subject: 'Contour email delivery is working',
    text:
      'This is the test message sent while configuring sign-in.\n\n' +
      'If it arrived, the one-time code will arrive the same way.\n',
  }),
});

const body = await probe.text();
if (!probe.ok) {
  let hint = '';
  if (probe.status === 401 || probe.status === 403) hint = '\n  The key was rejected. Check it was copied whole, and has Sending access.';
  else if (/domain is not verified|not verified/i.test(body)) hint = `\n  Resend will not send from ${from}. Either verify that domain, or drop the\n  third argument to use ${DEFAULT_FROM}.`;
  else if (/can only send testing emails|own email address/i.test(body)) hint = `\n  ${DEFAULT_FROM} only delivers to the address that owns the Resend\n  account. Use that address, or verify a domain of your own.`;
  die(`Resend refused (HTTP ${probe.status}): ${body.slice(0, 300)}${hint}`);
}
console.log(`  accepted — check ${testTo} (including spam) for "Contour email delivery is working"`);

// --- only now touch the deployment ------------------------------------------
const run = (cmd, args, stdin) =>
  new Promise((resolve) => {
    const p = spawn(cmd, args, { shell: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d) => { out += d; process.stdout.write(d); });
    p.stderr.on('data', (d) => { out += d; process.stderr.write(d); });
    if (stdin !== undefined) p.stdin.write(stdin);
    p.stdin.end();
    p.on('close', (code) => resolve({ code, out }));
  });

async function setVar(name, value) {
  console.log(`\n--- ${name} ---`);
  await run('npx', ['vercel', 'env', 'rm', name, 'production', '--yes']);
  const { code } = await run('npx', ['vercel', 'env', 'add', name, 'production'], value + '\n');
  if (code !== 0) die(`Could not set ${name}. Is the Vercel CLI logged in? Try: npx vercel login`);
}

await setVar('RESEND_API_KEY', apiKey);
await setVar('EMAIL_FROM', from);

console.log('\n--- redeploying (environment variables are injected at deploy time) ---');
if ((await run('npx', ['vercel', '--prod'])).code !== 0) die('The deploy failed. The output above says why.');

console.log('\n--- checking the live site ---');
const res = await fetch(SITE + '/api/auth/otp/request', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: testTo }),
});
const text = await res.text();

if (/not configured/i.test(text)) {
  die('Still reporting unconfigured. Rerun, or check: npx vercel env ls production');
}
if (!res.ok) die(`The code request failed (HTTP ${res.status}): ${text.slice(0, 300)}`);

console.log('\n  A real sign-in code has been sent to ' + testTo + '.');
console.log('  Sign in here: ' + SITE + '/login\n');
