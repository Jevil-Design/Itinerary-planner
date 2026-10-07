/**
 * The email layer, without sending anything real.
 *
 * A local SMTP server stands in for Gmail, so the SMTP path is exercised end to
 * end — connection, auth, and the message that comes out the other side.
 *
 *   node scripts/verify-email.mjs
 */
import { createServer } from 'node:net';

let pass = 0, fail = 0;
const ok = (label, cond, note = '') => {
  if (cond) { pass++; console.log(`  ok    ${label}${note ? '  [' + note + ']' : ''}`); }
  else { fail++; console.log(`  FAIL  ${label}${note ? '  [' + note + ']' : ''}`); }
};

const ENV_KEYS = ['SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASS','RESEND_API_KEY','EMAIL_FROM'];
const clear = () => ENV_KEYS.forEach((k) => delete process.env[k]);

// Fresh import each time: the module reads process.env on every call, but the
// cache-buster keeps the tests independent of import order.
const load = async () => await import('../lib/email-core.ts?' + Math.random());

console.log('\nEMAIL DELIVERY');
console.log('='.repeat(52));

/* ---------- provider selection ---------- */
clear();
let m = await load();
ok('nothing configured reports not configured', m.emailConfigured() === false, m.emailProvider());
ok('a send refuses rather than pretending', (await m.sendCode('a@b.com', '123456')).reason === 'not_configured');

clear();
process.env.RESEND_API_KEY = 're_x'; process.env.EMAIL_FROM = 'a@b.com';
m = await load();
ok('resend alone is enough', m.emailConfigured() && m.emailProvider() === 'resend');

clear();
process.env.RESEND_API_KEY = 're_x'; process.env.EMAIL_FROM = 'a@b.com';
process.env.SMTP_HOST = 'h'; process.env.SMTP_USER = 'u'; process.env.SMTP_PASS = 'p';
m = await load();
ok('smtp wins when both are set', m.emailProvider() === 'smtp', 'it reaches any recipient');

clear();
process.env.SMTP_HOST = 'h'; process.env.SMTP_USER = 'u'; process.env.SMTP_PASS = 'p';
m = await load();
ok('smtp without a sender is not configured', m.emailConfigured() === false, 'EMAIL_FROM missing');

/* ---------- a real SMTP conversation ---------- */
const received = [];
const server = createServer((sock) => {
  let buf = '', inData = false;
  sock.write('220 test ESMTP\r\n');
  sock.on('data', (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf('\r\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 2);
      if (inData) {
        if (line === '.') { inData = false; sock.write('250 queued\r\n'); }
        else received.push(line);
        continue;
      }
      const cmd = line.toUpperCase();
      if (cmd.startsWith('EHLO')) sock.write('250-test\r\n250 AUTH PLAIN LOGIN\r\n');
      else if (cmd.startsWith('AUTH')) sock.write('235 ok\r\n');
      else if (cmd.startsWith('MAIL') || cmd.startsWith('RCPT')) { received.push(line); sock.write('250 ok\r\n'); }
      else if (cmd === 'DATA') { inData = true; sock.write('354 go\r\n'); }
      else if (cmd === 'QUIT') { sock.write('221 bye\r\n'); sock.end(); }
      else sock.write('250 ok\r\n');
    }
  });
  sock.on('error', () => {});
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

clear();
process.env.SMTP_HOST = '127.0.0.1';
process.env.SMTP_PORT = String(port);
process.env.SMTP_USER = 'someone@gmail.com';
process.env.SMTP_PASS = 'app-password';
process.env.EMAIL_FROM = 'Contour <someone@gmail.com>';
m = await load();

const CODE = '483920';
const res = await m.sendCode('a-stranger@example.com', CODE);
ok('smtp send succeeds', res.ok === true && res.via === 'smtp', JSON.stringify(res).slice(0, 60));

const wire = received.join('\n');
ok('it goes to the requested recipient', /a-stranger@example\.com/.test(wire), 'any address, not just the account owner');
ok('the code is in the message', wire.includes(CODE));
ok('there is a plain-text part', /text\/plain/i.test(wire));
ok('there is an html part', /text\/html/i.test(wire));
ok('the subject carries the code', new RegExp('Subject:.*' + CODE).test(wire.replace(/\r/g, '')));
ok('the smtp password is not in the message', !wire.includes('app-password'));

/* ---------- failures must not leak the code ---------- */
clear();
process.env.SMTP_HOST = '127.0.0.1';
process.env.SMTP_PORT = '1';               // nothing is listening
process.env.SMTP_USER = 'u'; process.env.SMTP_PASS = 'secret-pass';
process.env.EMAIL_FROM = 'a@b.com';
m = await load();
const bad = await m.sendCode('a@b.com', CODE);
ok('a broken smtp host fails cleanly', bad.ok === false && bad.reason === 'send_failed');
ok('the error does not contain the code', !String(bad.detail).includes(CODE), String(bad.detail).slice(0, 48));

/* ---------- a blocked recipient must not be reported as retryable ---------- */
clear();
process.env.RESEND_API_KEY = 're_x'; process.env.EMAIL_FROM = 'a@b.com';
m = await load();
{
  // Stand in for Resend answering 403 for an address that is not the account owner.
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(
    JSON.stringify({ message: 'You can only send testing emails to your own email address (owner@x.com). To send emails to other recipients, please verify a domain at resend.com/domains', statusCode: 403 }),
    { status: 403 });
  const blocked = await m.sendCode('stranger@example.com', '483920');
  globalThis.fetch = realFetch;
  ok('a blocked recipient is its own failure kind', blocked.reason === 'recipient_not_allowed', blocked.reason);
  ok('it is NOT reported as a generic retryable failure', blocked.reason !== 'send_failed');
  ok('the blocked-recipient error does not leak the code', !String(blocked.detail).includes('483920'));
}
server.close();
console.log('-'.repeat(52));
console.log(`${pass}/${pass + fail} passed${fail ? ', ' + fail + ' FAILED' : ', all green'}`);
process.exit(fail ? 1 : 0);
