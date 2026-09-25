import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

/**
 * One-time codes with no server-side storage — the pure half.
 *
 * The usual design keeps issued codes in a table or Redis. We store nothing, so
 * the challenge itself is carried in a signed cookie: the email, a hash of the
 * code, an expiry and an attempt count, HMAC'd with a secret. The server can
 * verify a code it never kept, and there is no row anywhere tying a person to
 * this site.
 *
 * The secret is a parameter rather than an environment read, so this module is
 * pure, has no server-only guard, and can be tested directly. lib/otp.ts is the
 * thin wrapper that supplies it.
 */

const CODE_LENGTH = 6;
const TTL_SECONDS = 10 * 60;
const MAX_ATTEMPTS = 5;

const b64 = (b: Buffer) => b.toString('base64url');
const sign = (secret: string, payload: string) =>
  b64(createHmac('sha256', secret).update(payload).digest());

function seal(secret: string, payload: object): string {
  const body = b64(Buffer.from(JSON.stringify(payload)));
  return `${body}.${sign(secret, body)}`;
}

function open<T>(secret: string, token: string | undefined): T | null {
  if (!token) return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  // constant-time: a fast reject would leak how much of the MAC matched
  const a = Buffer.from(mac);
  const b = Buffer.from(sign(secret, body));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString()) as T;
  } catch {
    return null;
  }
}

/** Codes are compared by hash, so the plaintext is never written down anywhere. */
const hashCode = (secret: string, email: string, code: string) =>
  b64(createHmac('sha256', secret).update(`${email.toLowerCase()}:${code}`).digest());

export type Challenge = { email: string; hash: string; exp: number; tries: number };

export function createChallenge(secret: string, email: string): { code: string; cookie: string } {
  const code = String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0');
  const challenge: Challenge = {
    email: email.toLowerCase(),
    hash: hashCode(secret, email, code),
    exp: Math.floor(Date.now() / 1000) + TTL_SECONDS,
    tries: 0,
  };
  return { code, cookie: seal(secret, challenge) };
}

export type VerifyResult =
  | { ok: true; email: string; session: string }
  | { ok: false; reason: 'expired' | 'no_challenge' | 'too_many' | 'wrong'; cookie?: string };

export function verifyChallenge(secret: string, token: string | undefined, code: string): VerifyResult {
  const c = open<Challenge>(secret, token);
  if (!c) return { ok: false, reason: 'no_challenge' };
  if (c.exp < Math.floor(Date.now() / 1000)) return { ok: false, reason: 'expired' };
  if (c.tries >= MAX_ATTEMPTS) return { ok: false, reason: 'too_many' };

  const given = hashCode(secret, c.email, code.trim());
  const a = Buffer.from(given);
  const b = Buffer.from(c.hash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    // re-seal with the attempt counted, so guessing is bounded without storage
    return { ok: false, reason: 'wrong', cookie: seal(secret, { ...c, tries: c.tries + 1 }) };
  }

  const session = seal(secret, { email: c.email, exp: Math.floor(Date.now() / 1000) + 12 * 3600 });
  return { ok: true, email: c.email, session };
}

export function readSession(secret: string, token: string | undefined): { email: string } | null {
  const s = open<{ email: string; exp: number }>(secret, token);
  if (!s || s.exp < Math.floor(Date.now() / 1000)) return null;
  return { email: s.email };
}

/**
 * Generic signed-payload helpers, shared with the OAuth state cookie. Same
 * construction as the OTP challenge: base64url body, HMAC over it, constant-time
 * compare on the way back in.
 */
export const sealValue = seal;
export const openValue = open;

/** Exported so tests can forge a correctly-signed but hostile cookie. */
export const _seal = seal;
