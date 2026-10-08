'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { userClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/user';

/**
 * Trip actions, run on the server.
 *
 * Two things make these safe against one user touching another's trip:
 *
 *   1. The user is taken from the verified session, never from the form. A
 *      posted user_id is ignored entirely.
 *   2. Every statement is issued through the *user's* client, so Row Level
 *      Security applies. A trip id belonging to someone else matches no row —
 *      the delete affects nothing and the duplicate finds nothing to copy.
 *
 * The id is still validated as a UUID first, so a malformed one fails cleanly
 * instead of reaching Postgres as a type error.
 */

const TripId = z.string().uuid();

/*
 * Form actions must resolve to void, so a failure is reported by redirecting
 * back with a message rather than by returning one. The message is a fixed
 * string, never the database error — that would leak schema detail to anyone
 * who can submit the form.
 */
const back = (error?: string) =>
  redirect('/dashboard' + (error ? '?error=' + encodeURIComponent(error) : ''));

export async function deleteTrip(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return back('Sign in first.');

  const parsed = TripId.safeParse(formData.get('tripId'));
  if (!parsed.success) return back('That is not a valid trip.');

  const supabase = await userClient();
  const { error } = await supabase.from('trips').delete().eq('id', parsed.data);
  if (error) {
    console.error('[deleteTrip]', error.code, error.message);
    return back('Could not delete that trip.');
  }

  revalidatePath('/dashboard');
}

export async function duplicateTrip(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return back('Sign in first.');

  const parsed = TripId.safeParse(formData.get('tripId'));
  if (!parsed.success) return back('That is not a valid trip.');

  const supabase = await userClient();

  // RLS makes this return nothing for a trip the user does not own, so the copy
  // simply never happens — no ownership check is needed in this code.
  const { data: original, error: readErr } = await supabase
    .from('trips')
    .select('*')
    .eq('id', parsed.data)
    .maybeSingle();

  if (readErr || !original) return back('That trip could not be found.');

  const { id, created_at, updated_at, ...rest } = original as Record<string, unknown>;
  void id; void created_at; void updated_at;

  const { error: insertErr } = await supabase.from('trips').insert({
    ...rest,
    // Set from the session rather than copied, so a duplicate can never land in
    // another account even if the source row were somehow wrong.
    user_id: user.id,
    title: `${String(original.title ?? 'Trip')} (copy)`,
    status: 'draft',
  });

  if (insertErr) {
    console.error('[duplicateTrip]', insertErr.code, insertErr.message);
    return back('Could not duplicate that trip.');
  }

  revalidatePath('/dashboard');
}
