import 'server-only';
import { cache } from 'react';
import { userClient, currentUser } from '@/lib/supabase/server';

/**
 * The authenticated user, in one place.
 *
 * Every server-side read or write of trip data goes through this rather than
 * accepting an id from the request. That is the whole defence against one user
 * reading another's trip by changing a UUID in the URL — the id is derived from
 * a verified token, never from the caller.
 *
 * Wrapped in React's `cache` so a page that needs the user in three components
 * verifies the token once per request instead of three times.
 */

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  currency: string;
};

/** The verified user, or null. Never trusts a client-supplied id. */
export const getCurrentUser = cache(async () => currentUser());

/**
 * The user's profile row.
 *
 * Returns null when signed out. If the row is somehow missing — a user created
 * before the trigger existed, say — a minimal profile is derived from the auth
 * record rather than throwing, so the account menu still renders.
 */
export const getUserProfile = cache(async (): Promise<Profile | null> => {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await userClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, avatar_url, currency')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    console.error('[profile] read failed', error.code, error.message);
  }
  if (data) return data as Profile;

  return {
    id: user.id,
    email: user.email ?? '',
    full_name: (user.user_metadata?.full_name as string) ?? null,
    avatar_url: null,
    currency: 'INR',
  };
});

/**
 * The user, or a thrown error. For routes that have already been guarded and
 * want to stop rather than branch.
 */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error('UNAUTHENTICATED');
  return user;
}

/** A display name that is never empty. */
export function displayName(profile: Profile | null): string {
  if (!profile) return 'there';
  const name = profile.full_name?.trim();
  if (name) return name.split(/\s+/)[0];
  return profile.email.split('@')[0] || 'there';
}
