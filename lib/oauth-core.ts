import { createHash, randomBytes } from 'node:crypto';
import { sealValue, openValue } from './otp-core.ts';

/**
 * Google sign-in, stateless — the pure half.
 *
 * Same posture as the one-time code: nothing is stored. The CSRF state and the
 * PKCE verifier ride in a short-lived signed cookie, so the callback can check
 * both without a session table. What comes back is an email, which goes into
 * the same signed session cookie the OTP path issues. No profile is kept.
 *
 * The secret is a parameter so this module stays pure and testable; lib/google.ts
 * is the server wrapper that supplies it.
 */

export type OAuthState = { nonce: string; verifier: string; exp: number; next: string };

const STATE_TTL = 10 * 60;
const b64u = (b: Buffer) => b.toString('base64url');

/** PKCE S256: the verifier stays in our cookie, only its hash goes to Google. */
export function createPkce(): { verifier: string; challenge: string } {
  const verifier = b64u(randomBytes(32));
  const challenge = b64u(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

export function createState(secret: string, next = '/plan'): { state: string; cookie: string; pkce: ReturnType<typeof createPkce> } {
  const pkce = createPkce();
  const nonce = b64u(randomBytes(16));
  const payload: OAuthState = {
    nonce,
    verifier: pkce.verifier,
    exp: Math.floor(Date.now() / 1000) + STATE_TTL,
    // only same-site paths, so the callback cannot be used as an open redirect
    next: next.startsWith('/') && !next.startsWith('//') ? next : '/plan',
  };
  return { state: nonce, cookie: sealValue(secret, payload), pkce };
}

export type StateCheck =
  | { ok: true; verifier: string; next: string }
  | { ok: false; reason: 'missing' | 'expired' | 'mismatch' };

export function checkState(secret: string, cookie: string | undefined, state: string | null): StateCheck {
  const s = openValue<OAuthState>(secret, cookie);
  if (!s) return { ok: false, reason: 'missing' };
  if (s.exp < Math.floor(Date.now() / 1000)) return { ok: false, reason: 'expired' };
  if (!state || state !== s.nonce) return { ok: false, reason: 'mismatch' };
  return { ok: true, verifier: s.verifier, next: s.next };
}

export function authorizeUrl(opts: {
  clientId: string; redirectUri: string; state: string; challenge: string;
}): string {
  const p = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: 'code',
    scope: 'openid email',
    state: opts.state,
    code_challenge: opts.challenge,
    code_challenge_method: 'S256',
    // no refresh token: there is nothing to keep, so nothing to refresh
    access_type: 'online',
    prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export type IdTokenClaims = { email: string; emailVerified: boolean };

/**
 * The ID token arrives over TLS straight from Google's token endpoint, which is
 * the case where Google's own guidance allows skipping signature verification.
 * The claims that decide anything are still checked.
 */
export function readIdToken(idToken: string, clientId: string): IdTokenClaims | { error: string } {
  const parts = idToken.split('.');
  if (parts.length !== 3) return { error: 'malformed id token' };

  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  } catch {
    return { error: 'unreadable id token' };
  }

  const iss = String(claims.iss ?? '');
  if (iss !== 'https://accounts.google.com' && iss !== 'accounts.google.com') {
    return { error: 'unexpected issuer' };
  }
  const aud = claims.aud;
  if (aud !== clientId) return { error: 'token issued for a different client' };

  const exp = Number(claims.exp ?? 0);
  if (!exp || exp < Math.floor(Date.now() / 1000)) return { error: 'expired id token' };

  const email = typeof claims.email === 'string' ? claims.email : '';
  if (!email) return { error: 'no email on the token' };

  const emailVerified = claims.email_verified === true || claims.email_verified === 'true';
  if (!emailVerified) return { error: 'that Google account has an unverified email' };

  return { email: email.toLowerCase(), emailVerified };
}
