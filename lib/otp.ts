import 'server-only';
import * as core from '@/lib/otp-core';

/**
 * Server-side wrapper around lib/otp-core. Its only job is to hold AUTH_SECRET,
 * which must never reach a client bundle — hence the server-only guard here and
 * not in the pure module.
 */

export const CHALLENGE_COOKIE = 'contour_otp';
export const SESSION_COOKIE = 'contour_session';

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      'AUTH_SECRET is missing or too short. Generate one with ' +
        '`node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"`.',
    );
  }
  return s;
}

export function authSecretConfigured(): boolean {
  const s = process.env.AUTH_SECRET;
  return Boolean(s && s.length >= 32);
}

export const createChallenge = (email: string) => core.createChallenge(secret(), email);
export const verifyChallenge = (token: string | undefined, code: string) =>
  core.verifyChallenge(secret(), token, code);
export const readSession = (token: string | undefined) => core.readSession(secret(), token);

export const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
} as const;
