import 'server-only';
import { stackServerApp } from '@/stack';
import { ensureProfile } from '@/lib/queries/trips';

/**
 * Resolves the signed-in user for a route handler and guarantees the profile
 * row exists before any query that foreign-keys to it. Returns null when there
 * is no session, so callers can answer 401 rather than throwing.
 */
export async function currentUser(): Promise<{ id: string; email: string | null } | null> {
  const user = await stackServerApp.getUser();
  if (!user) return null;
  await ensureProfile(user.id);
  return { id: user.id, email: user.primaryEmail ?? null };
}
