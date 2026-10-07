import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

/**
 * Supabase on the server.
 *
 * Two clients, and the difference between them is the whole security story:
 *
 *   userClient()    acts as the signed-in user. Row Level Security applies, so
 *                   the database itself refuses to return another user's rows.
 *                   This is what almost everything should use.
 *
 *   adminClient()   uses the service role and bypasses RLS entirely. It exists
 *                   for the provider cache, which belongs to no user. Every
 *                   call site must do its own authorisation first, because the
 *                   database will not.
 *
 * `server-only` at the top means importing either from a client component is a
 * build error rather than a leaked key.
 */

export function supabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim(),
  );
}

export function serviceRoleConfigured(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL!.trim();

/**
 * The signed-in user's client, reading the session from cookies.
 *
 * Next forbids writing cookies during a render, which is why the setter is
 * wrapped: a Server Component refreshing a token would otherwise throw. The
 * middleware refreshes it instead, so swallowing the error here is correct
 * rather than merely convenient.
 */
export async function userClient() {
  const store = await cookies();
  return createServerClient(url(), process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!.trim(), {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          /* called from a Server Component; middleware owns the refresh */
        }
      },
    },
  });
}

/**
 * Service-role client. Bypasses RLS — use only where no user owns the data.
 * Throws rather than falling back, so a missing key fails loudly at the call
 * site instead of silently degrading to an unauthenticated client.
 */
export function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set.');
  return createClient(url(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** The signed-in user, or null. Never trusts a client-supplied id. */
export async function currentUser() {
  if (!supabaseConfigured()) return null;
  const supabase = await userClient();
  // getUser() verifies the JWT with the auth server; getSession() does not.
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}
