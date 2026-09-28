/**
 * Turns on emailed sign-in codes for every recipient, with no DNS work.
 *
 *   node scripts/setup-smtp.mjs <gmail-address> <app-password> [test-recipient]
 *
 * Gmail's SMTP will send to anyone, which is the whole point: the Resend
 * sandbox sender only delivers to the Resend account owner. The trade is a
 * limit of roughly 500 messages a day and a personal From address.
 *
 * An app password, never the account password: Google requires 2-Step
 * Verification, then myaccount.google.com/apppasswords issues a 16-character
 * password scoped to one app and revocable on its own.
 */
import { spawn } from 'node:child_process';
import nodemailer from 'nodemailer';

const SITE = process.env.SITE ?? 'https://itinerary-planner-virid.vercel.app';
const [user, rawPass, testTo] = process.argv.slice(2);
// Google prints app passwords in four groups of four; the spaces are display only.
const pass = rawPass?.replace(/\s+/g, '');

const die = (m) => { console.error('\n  ' + m + '\n'); process.exit(1); };

if (!user || !pass) {
  console.log(`
Usage: node scripts/setup-smtp.mjs <gmail-address> <app-password> [test-recipient]

  1. myaccount.google.com -> Security -> turn on 2-Step Verification
  2. myaccount.google.com/apppasswords -> create one, name it anything
  3. Copy the 16-character password and run this with it.

Pass a third argument — an address that is NOT your own — to prove delivery
reaches other people, which is the reason for doing this at all.
`);
  process.exit(1);
}
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(user)) die(`Not a valid address: ${user}`);
if (pass.length !== 16) {
  die(`A Google app password is 16 characters; this is ${pass.length}.
  That is probably the account password, which will not work and should not be used.`);
}

const host = user.endsWith('@gmail.com') || user.endsWith('@googlemail.com')
  ? 'smtp.gmail.com'
  : (process.env.SMTP_HOST_OVERRIDE ?? 'smtp.gmail.com');
const from = `Contour <${user}>`;
const recipient = testTo?.trim() || user;

console.log(`\n--- sending a test message via ${host} ---`);
console.log(`  from: ${from}`);
console.log(`  to:   ${recipient}${recipient === user ? '  (your own address — pass a third argument to test another)' : ''}`);

try {
  const transport = nodemailer.createTransport({
    host, port: 587, secure: false, auth: { user, pass },
  });
  await transport.verify();
  await transport.sendMail({
    from, to: recipient,
    subject: 'Contour email delivery is working',
    text: 'This is the test message sent while configuring sign-in.\n\n'
      + 'If it arrived, the six-digit code will arrive the same way.\n',
  });
  console.log('  accepted — check that inbox, including spam');
} catch (e) {
  const msg = String(e.message ?? e);
  let hint = '';
  if (/Invalid login|535|BadCredentials/i.test(msg)) {
    hint = '\n  Google rejected the login. Use an app password from'
         + '\n  myaccount.google.com/apppasswords, not the account password.';
  } else if (/ETIMEDOUT|ECONNREFUSED/i.test(msg)) {
    hint = '\n  Could not reach the SMTP server. A network or firewall is blocking port 587.';
  }
  die(`SMTP refused: ${msg.slice(0, 250)}${hint}`);
}

const run = (cmd, args, stdin) =>
  new Promise((resolve) => {
    const p = spawn(cmd, args, { shell: true, stdio: ['pipe', 'pipe', 'pipe'] });
    p.stdout.on('data', (d) => process.stdout.write(d));
    p.stderr.on('data', (d) => process.stderr.write(d));
    if (stdin !== undefined) p.stdin.write(stdin);
    p.stdin.end();
    p.on('close', (code) => resolve(code));
  });

async function setVar(name, value) {
  console.log(`\n--- ${name} ---`);
  await run('npx', ['vercel', 'env', 'rm', name, 'production', '--yes']);
  if ((await run('npx', ['vercel', 'env', 'add', name, 'production'], value + '\n')) !== 0) {
    die(`Could not set ${name}. Is the Vercel CLI logged in?`);
  }
}

await setVar('SMTP_HOST', host);
await setVar('SMTP_PORT', '587');
await setVar('SMTP_USER', user);
await setVar('SMTP_PASS', pass);
await setVar('EMAIL_FROM', from);

console.log('\n--- redeploying (environment variables are injected at deploy time) ---');
if ((await run('npx', ['vercel', '--prod'])) !== 0) die('The deploy failed; the output above says why.');

console.log('\n--- checking the live site ---');
const res = await fetch(SITE + '/api/auth/otp/request', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: recipient }),
});
const text = await res.text();
if (/not configured/i.test(text)) die('Still unconfigured. Rerun, or check: npx vercel env ls production');
if (!res.ok) die(`The code request failed (HTTP ${res.status}): ${text.slice(0, 250)}`);

console.log(`\n  A real sign-in code has been sent to ${recipient}.`);
console.log('  Anyone can now receive one — no domain, no DNS.');
console.log('  Gmail allows roughly 500 messages a day.\n');
console.log('  Sign in here: ' + SITE + '/login\n');
