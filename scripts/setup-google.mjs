/**
 * Turns the Google button on. Everything here is the half that can be automated;
 * the client ID and secret have to be minted by hand in the Google Cloud Console
 * because they belong to a Google account, not to this repository.
 *
 *   node scripts/setup-google.mjs <client-id> <client-secret>
 *
 * Sets both on Vercel production, redeploys (Vercel injects environment
 * variables at deploy time, so a variable added to an existing deployment never
 * reaches it), then checks the live endpoint really does reach Google.
 */
import { spawn } from 'node:child_process';

const SITE = process.env.SITE ?? 'https://itinerary-planner-virid.vercel.app';
const CALLBACK = SITE + '/api/auth/google/callback';
const [clientId, clientSecret] = process.argv.slice(2);

const die = (msg) => { console.error('\n  ' + msg + '\n'); process.exit(1); };

if (!clientId || !clientSecret) {
  console.log(`
Usage: node scripts/setup-google.mjs <client-id> <client-secret>

Get the pair from the Google Cloud Console:

  1. console.cloud.google.com  ->  pick or create a project
  2. APIs & Services  ->  OAuth consent screen
       User type: External. Fill in app name and support email.
       Scopes: no extra scopes needed; openid and email are default.
       Test users: add the addresses you want to sign in with while the
       consent screen is still in Testing.
  3. APIs & Services  ->  Credentials  ->  Create credentials
       ->  OAuth client ID  ->  Web application
  4. Authorised redirect URIs  ->  ADD URI, exactly these two:

       ${CALLBACK}
       http://localhost:3000/api/auth/google/callback

     Exactly means exactly: https not http, no trailing slash, no /callback/.
     A single character off and Google answers redirect_uri_mismatch.

  5. Create. Copy the client ID and the client secret, then rerun this with
     both as arguments.
`);
  process.exit(1);
}

// The two commonest paste errors: swapping the pair, or grabbing the project
// number instead of the client ID. Both are cheaper to catch here than after a
// redeploy and a round trip to Google.
if (!clientId.endsWith('.apps.googleusercontent.com')) {
  die(`That does not look like a client ID — it should end in
  .apps.googleusercontent.com. Got: ${clientId.slice(0, 40)}...`);
}
if (!/^GOCSPX-/.test(clientSecret)) {
  die(`That does not look like a client secret — Google's start with GOCSPX-.
  Did the two arguments get swapped?`);
}

const run = (cmd, args, stdin) =>
  new Promise((resolve) => {
    const p = spawn(cmd, args, { shell: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d) => { out += d; process.stdout.write(d); });
    p.stderr.on('data', (d) => { out += d; process.stderr.write(d); });
    if (stdin !== undefined) { p.stdin.write(stdin); }
    p.stdin.end();
    p.on('close', (code) => resolve({ code, out }));
  });

async function setVar(name, value) {
  console.log(`\n--- ${name} ---`);
  // Remove first so a rerun updates rather than colliding. A missing variable
  // makes this fail harmlessly, which is why the exit code is ignored.
  await run('npx', ['vercel', 'env', 'rm', name, 'production', '--yes']);
  const { code } = await run('npx', ['vercel', 'env', 'add', name, 'production'], value + '\n');
  if (code !== 0) die(`Could not set ${name}. Is the Vercel CLI logged in? Try: npx vercel login`);
}

await setVar('GOOGLE_CLIENT_ID', clientId);
await setVar('GOOGLE_CLIENT_SECRET', clientSecret);

console.log('\n--- redeploying (environment variables are injected at deploy time) ---');
const deploy = await run('npx', ['vercel', '--prod']);
if (deploy.code !== 0) die('The deploy failed. The output above says why.');

console.log('\n--- checking the live site ---');
const res = await fetch(SITE + '/api/auth/google/start', { redirect: 'manual' });
const loc = res.headers.get('location') ?? '';

if (/error=google_unconfigured/.test(loc)) {
  die('Still unconfigured. The deploy may not have picked the variables up — rerun,\n  or check: npx vercel env ls production');
}
if (!/accounts\.google\.com/.test(loc)) {
  die('Unexpected redirect: ' + loc);
}

const sent = new URL(loc).searchParams.get('redirect_uri');
console.log('\n  Google button reaches Google.');
console.log('  redirect_uri being sent: ' + sent);
if (sent !== CALLBACK) {
  die(`It does not match the callback this script told you to register.
  Register this exact URI in the Google Console instead: ${sent}`);
}
console.log('  It matches the URI registered in the Google Console.\n');
console.log('  Sign in here: ' + SITE + '/login\n');
