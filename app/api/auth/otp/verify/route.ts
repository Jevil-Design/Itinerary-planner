import { cookies } from 'next/headers';
import { z } from 'zod';
import { verifyChallenge, CHALLENGE_COOKIE, SESSION_COOKIE, cookieOptions } from '@/lib/otp';
import { ok, fail } from '@/lib/http';

export const dynamic = 'force-dynamic';

const schema = z.object({ code: z.string().trim().regex(/^\d{6}$/, 'Enter the six-digit code.') });

const MESSAGES = {
  no_challenge: 'That code has expired or was never requested. Ask for a new one.',
  expired: 'That code has expired. Ask for a new one.',
  too_many: 'Too many attempts. Request a fresh code.',
  wrong: 'That code is not right.',
} as const;

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return fail('VALIDATION_FAILED', 'Expected a JSON body.'); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message);

  const jar = await cookies();
  const result = verifyChallenge(jar.get(CHALLENGE_COOKIE)?.value, parsed.data.code);

  if (!result.ok) {
    // re-seal with the attempt counted, so guesses stay bounded without storage
    if (result.cookie) jar.set(CHALLENGE_COOKIE, result.cookie, { ...cookieOptions, maxAge: 600 });
    else jar.delete(CHALLENGE_COOKIE);
    return fail('AUTH_FAILED', MESSAGES[result.reason]);
  }

  jar.delete(CHALLENGE_COOKIE);
  jar.set(SESSION_COOKIE, result.session, { ...cookieOptions, maxAge: 12 * 3600 });
  return ok({ email: result.email });
}
