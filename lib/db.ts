import { neon } from '@neondatabase/serverless';

/**
 * Two connections, on purpose.
 *
 * `sql` uses DATABASE_URL, which authenticates as neondb_owner. That role OWNS
 * every table, and a Postgres table owner BYPASSES row level security. It is
 * the service path: fast, no JWT round trip, and the only way to touch
 * api_cache. Because RLS does not protect it, every query that reaches user
 * data must scope itself explicitly — which is why nothing in lib/queries
 * accepts a query without a userId.
 *
 * `sqlAsUser` uses DATABASE_AUTHENTICATED_URL and carries the caller's Stack
 * Auth JWT, so it connects as the `authenticated` role and RLS does bind. That
 * is defence in depth: even a query that forgot its WHERE clause returns
 * nothing that does not belong to the caller.
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `${name} is not set. Copy .env.example to .env.local and fill it in — ` +
        `the connection string is in the Neon Console under Connect.`,
    );
  }
  return v;
}

export const sql = neon(required('DATABASE_URL'));

export function sqlAsUser(authToken: string) {
  return neon(required('DATABASE_AUTHENTICATED_URL'), { authToken });
}

/** Narrow a Postgres error into something a route handler can map to a status. */
export function isForbidden(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === '42501';
}
