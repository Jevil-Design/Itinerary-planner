import 'server-only';
import * as core from '@/lib/oauth-core';
import { sealValue } from '@/lib/otp-core';

/**
 * Server wrapper for Google sign-in. Holds the client secret and the signing
 * secret; everything else lives in lib/oauth-core so it stays testable.
 */

export const STATE_COOKIE = 'contour_oauth';

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error('AUTH_SECRET is missing or too short.');
  return s;
}

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
}

/**
 * Derived from the incoming request, so previews and custom domains work with no
 * per-environment variable.
 *
 * Deliberately NOT NEXT_PUBLIC_SITE_URL: NEXT_PUBLIC_* values are inlined into
 * the bundle at build time, so that would freeze the redirect URI to whatever
 * the build machine had — localhost, in practice — and Google would reject every
 * production callback for a redirect_uri mismatch. APP_ORIGIN is server-side and
 * read at runtime, for the case where a proxy misreports the host.
 */
export function redirectUri(req: Request): string {
  const override = process.env.APP_ORIGIN?.trim();
  if (override) return new URL('/api/auth/google/callback', override).toString();
  const url = new URL(req.url);
  const host = req.headers.get('x-forwarded-host') ?? url.host;
  const proto = req.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
  return `${proto}://${host}/api/auth/google/callback`;
}

export function startAuth(req: Request, next?: string) {
  const { state, cookie, pkce } = core.createState(secret(), next);
  return {
    cookie,
    url: core.authorizeUrl({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      redirectUri: redirectUri(req),
      state,
      challenge: pkce.challenge,
    }),
  };
}

export const checkState = (cookie: string | undefined, state: string | null) =>
  core.checkState(secret(), cookie, state);

/** Swaps the authorization code for tokens. Server to server, secret never leaves. */
export async function exchangeCode(code: string, verifier: string, req: Request) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(req),
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
  });

  if (!res.ok) {
    return { error: `token exchange failed (${res.status})`, detail: (await res.text()).slice(0, 200) };
  }
  const json = (await res.json()) as { id_token?: string };
  if (!json.id_token) return { error: 'no id token returned' };

  const claims = core.readIdToken(json.id_token, process.env.GOOGLE_CLIENT_ID!);
  if ('error' in claims) return { error: claims.error };
  return { email: claims.email };
}

/** Same session shape the one-time-code path issues: an email, and nothing else. */
export function issueSession(email: string): string {
  return sealValue(secret(), { email, exp: Math.floor(Date.now() / 1000) + 12 * 3600 });
}
