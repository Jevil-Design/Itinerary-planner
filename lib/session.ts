import 'server-only';
import { cookies } from 'next/headers';
import { readSession, SESSION_COOKIE } from '@/lib/otp';

/**
 * The whole of session state: an email, carried in a signed cookie. There is no
 * user table to look it up in, by design.
 */
export async function currentSession(): Promise<{ email: string } | null> {
  try {
    return readSession((await cookies()).get(SESSION_COOKIE)?.value);
  } catch {
    // readSession throws only when AUTH_SECRET is unset; treat that as signed out
    return null;
  }
}
