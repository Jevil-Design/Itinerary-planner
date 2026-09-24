import { cookies } from 'next/headers';
import { z } from 'zod';
import { createChallenge, authSecretConfigured, CHALLENGE_COOKIE, cookieOptions } from '@/lib/otp';
import { sendCode, emailConfigured } from '@/lib/email';
import { ok, fail } from '@/lib/http';

export const dynamic = 'force-dynamic';

const schema = z.object({ email: z.string().trim().email('Enter a valid email address.') });

export async function POST(req: Request) {
  // Validate the input before reporting on configuration, so a malformed
  // address gets the message about the address rather than about the server.
  let body: unknown;
  try { body = await req.json(); } catch { return fail('VALIDATION_FAILED', 'Expected a JSON body.'); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message);

  if (!authSecretConfigured()) {
    return fail('GENERATION_FAILED', 'Sign-in is not configured on this deployment (AUTH_SECRET).');
  }
  if (!emailConfigured()) {
    return fail(
      'GENERATION_FAILED',
      'Email delivery is not configured, so a code cannot be sent. Set RESEND_API_KEY and EMAIL_FROM.',
    );
  }

  const { code, cookie } = createChallenge(parsed.data.email);
  const sent = await sendCode(parsed.data.email, code);
  if (!sent.ok) {
    console.error('[otp/request] send failed', sent.reason, sent.detail);
    return fail('GENERATION_FAILED', 'The code could not be sent. Try again in a moment.');
  }

  (await cookies()).set(CHALLENGE_COOKIE, cookie, { ...cookieOptions, maxAge: 600 });
  // The address is echoed so the UI can say where it went; the code never is.
  return ok({ sent: true, email: parsed.data.email });
}
