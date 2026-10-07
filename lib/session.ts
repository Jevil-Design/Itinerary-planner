import 'server-only';
import { currentUser } from '@/lib/supabase/server';

/**
 * Who is signed in, for routes that only need an address.
 *
 * Backed by Supabase Auth now rather than a self-signed cookie. The token is
 * verified against the auth server on every call — a decoded cookie is not
 * evidence of anything, because the browser owns it.
 */
export async function currentSession(): Promise<{ email: string } | null> {
  const user = await currentUser();
  return user?.email ? { email: user.email } : null;
}
