import Link from 'next/link';
import { currentUser } from '@/lib/supabase/server';
import { userClient } from '@/lib/supabase/server';
import { listTrips } from '@/lib/trips/persist';

export const dynamic = 'force-dynamic';

/**
 * Where a signed-in user lands.
 *
 * Deliberately small for now: it proves the whole chain — Supabase session,
 * middleware refresh, RLS-scoped read — rather than pretending to be the full
 * dashboard the brief describes. Trip cards, statistics and saved places come
 * with the rest of that work.
 */
export default async function Dashboard() {
  const user = await currentUser();
  // Middleware already guards this route; this is the server-side belt to that
  // braces, because a route must never rely on middleware alone.
  if (!user) {
    return (
      <main className="mx-auto max-w-content px-5 py-16">
        <h1 className="display text-[32px]">Not signed in</h1>
        <Link href="/login" className="text-terracotta underline">Sign in</Link>
      </main>
    );
  }

  const supabase = await userClient();
  const trips = await listTrips(supabase);

  return (
    <main className="mx-auto max-w-content px-5 py-14">
      <p className="text-[11px] uppercase tracking-[0.2em] text-ink3">Signed in</p>
      <h1 className="display mt-2 text-[34px]">{user.email}</h1>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/plan"
          className="rounded bg-terracotta px-6 py-3.5 text-[15px] font-bold text-white no-underline"
        >
          Open the planner
        </Link>
        <form action="/api/auth/signout" method="post">
          <button
            type="submit"
            className="rounded border border-line2 bg-white px-6 py-3.5 text-[15px] font-semibold text-ink"
          >
            Sign out
          </button>
        </form>
      </div>

      <h2 className="mt-12 text-[13px] uppercase tracking-[0.14em] text-ink3">Your trips</h2>
      {!trips.ok ? (
        <p className="mt-3 text-[14.5px] text-danger">Could not load your trips: {trips.error}</p>
      ) : trips.data.length === 0 ? (
        <p className="mt-3 text-[14.5px] text-ink2">
          No trips yet. Open the planner to build one.
        </p>
      ) : (
        <ul className="mt-4 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2">
          {trips.data.map((t) => (
            <li key={t.id} className="rounded-card border border-line bg-white p-5">
              <h3 className="m-0 text-[17px] font-bold tracking-tight">{t.title}</h3>
              <p className="mt-1.5 text-[13.5px] text-ink2">
                {t.origin_name?.split(',')[0]} → {t.dest_name?.split(',')[0]}
                {t.distance_km ? ` · ${t.distance_km} km` : ''}
              </p>
              <p className="mt-1 text-[12px] uppercase tracking-[0.12em] text-ink3">{t.status}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
