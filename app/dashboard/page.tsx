import Link from 'next/link';
import { redirect } from 'next/navigation';
import { userClient } from '@/lib/supabase/server';
import { getUserProfile, displayName } from '@/lib/auth/user';
import { listTrips } from '@/lib/trips/persist';
import { deleteTrip, duplicateTrip } from './actions';

export const dynamic = 'force-dynamic';

/**
 * My Trips.
 *
 * The query is scoped by Row Level Security, not by a filter in this file —
 * listTrips selects from `trips` with no `where user_id`, and the database
 * returns only the caller's rows. That is the difference the brief asks for:
 * another user's trip is not fetched and then hidden, it is never fetched.
 */
export default async function Dashboard() {
  const profile = await getUserProfile();
  // Middleware already guards this route. This is the second lock: a route must
  // never depend on middleware alone, because a config change could skip it.
  if (!profile) redirect('/login?next=/dashboard');

  const supabase = await userClient();
  const trips = await listTrips(supabase);

  return (
    <main className="mx-auto max-w-content px-5 py-12">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-ink3">Dashboard</p>
          <h1 className="display mt-2 text-[34px]">Hello, {displayName(profile)}</h1>
          <p className="mt-1 text-[14.5px] text-ink2">Where are you going next?</p>
        </div>
        <AccountMenu email={profile.email} name={profile.full_name} />
      </header>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/plan"
          className="rounded bg-terracotta px-6 py-3.5 text-[15px] font-bold text-white no-underline"
        >
          + Create new trip
        </Link>
      </div>

      <h2 className="mt-12 text-[13px] uppercase tracking-[0.14em] text-ink3">My trips</h2>

      {!trips.ok ? (
        <p className="mt-3 text-[14.5px] text-danger">Could not load your trips: {trips.error}</p>
      ) : trips.data.length === 0 ? (
        <div className="mt-4 rounded-card border border-dashed border-line2 bg-sand/30 p-8 text-center">
          <p className="m-0 text-[15px] font-semibold text-ink">No trips yet</p>
          <p className="mx-auto mt-1.5 max-w-[46ch] text-[14px] text-ink2">
            Build one in the planner and it will be saved to your account, ready on any device.
          </p>
          <Link
            href="/plan"
            className="mt-5 inline-block rounded bg-terracotta px-6 py-3 text-[14.5px] font-bold text-white no-underline"
          >
            Plan a trip
          </Link>
        </div>
      ) : (
        <ul className="mt-4 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2">
          {trips.data.map((t) => (
            <li key={t.id} className="rounded-card border border-line bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <h3 className="m-0 text-[17px] font-bold tracking-tight">{t.title}</h3>
                <span className="shrink-0 rounded bg-sand px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-ink3">
                  {t.status}
                </span>
              </div>

              <p className="mt-1.5 text-[13.5px] text-ink2">
                {t.origin_name?.split(',')[0]} → {t.dest_name?.split(',')[0]}
              </p>

              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[12.5px]">
                <Row label="Mode" value={t.mode} />
                <Row label="Dates" value={t.start_date ?? 'Not set'} />
                <Row
                  label="Distance"
                  value={t.distance_km ? `${t.distance_km} km` : '—'}
                />
                <Row
                  label="Travel"
                  value={t.driving_minutes ? `${(t.driving_minutes / 60).toFixed(1)} h` : '—'}
                />
              </dl>

              <p className="mt-3 text-[11.5px] text-ink3">
                Updated {new Date(t.updated_at as string).toLocaleDateString('en-GB', {
                  day: 'numeric', month: 'short', year: 'numeric',
                })}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href="/plan"
                  className="rounded border border-line2 bg-white px-3.5 py-2 text-[13px] font-semibold text-ink no-underline"
                >
                  Open
                </Link>
                <form action={duplicateTrip}>
                  <input type="hidden" name="tripId" value={t.id} />
                  <button
                    type="submit"
                    className="rounded border border-line2 bg-white px-3.5 py-2 text-[13px] font-semibold text-ink"
                  >
                    Duplicate
                  </button>
                </form>
                <form action={deleteTrip}>
                  <input type="hidden" name="tripId" value={t.id} />
                  <button
                    type="submit"
                    className="rounded border border-line2 bg-white px-3.5 py-2 text-[13px] font-semibold text-danger"
                  >
                    Delete
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <>
      <dt className="text-ink3">{label}</dt>
      <dd className="m-0 text-right font-medium text-ink">{value}</dd>
    </>
  );
}

function AccountMenu({ email, name }: { email: string; name: string | null }) {
  return (
    <details className="relative">
      <summary className="cursor-pointer list-none rounded border border-line2 bg-white px-4 py-2.5 text-[13.5px] font-semibold text-ink">
        {name?.trim() || email} ▾
      </summary>
      <div className="absolute right-0 z-10 mt-2 w-[230px] rounded-card border border-line bg-white p-2 shadow-card">
        <p className="m-0 px-3 py-2 text-[12px] text-ink3">{email}</p>
        <Link href="/dashboard" className="block rounded px-3 py-2 text-[13.5px] text-ink no-underline hover:bg-cream">
          My trips
        </Link>
        <Link href="/forgot-password" className="block rounded px-3 py-2 text-[13.5px] text-ink no-underline hover:bg-cream">
          Change password
        </Link>
        <form action="/api/auth/signout" method="post">
          <button
            type="submit"
            className="w-full rounded bg-transparent px-3 py-2 text-left text-[13.5px] font-semibold text-danger hover:bg-cream"
          >
            Log out
          </button>
        </form>
      </div>
    </details>
  );
}
