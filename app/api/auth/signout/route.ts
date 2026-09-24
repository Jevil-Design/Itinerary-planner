import { cookies } from 'next/headers';
import { SESSION_COOKIE, CHALLENGE_COOKIE } from '@/lib/otp';
import { ok } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function POST() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(CHALLENGE_COOKIE);
  return ok({ signedOut: true });
}
