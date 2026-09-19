import Link from 'next/link';
import { currentUser } from '@/lib/auth';
import { listTrips } from '@/lib/queries/trips';

export const dynamic = 'force-dynamic';

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const fmt = (iso: string) => dateFmt.format(new Date(iso + 'T00:00:00Z'));

export default async function TripsPage() {
  const user = await currentUser();
  // The layout already redirected an unauthenticated visitor; this is belt and braces.
  if (!user) return null;

  const trips = await listTrips(user.id);

  if (trips.length === 0) {
    return (
      <div className="rounded border border-dashed border-line2 px-6 py-14 text-center">
        <h1 className="m-0 text-2xl font-normal">No trips yet</h1>
        <p className="mx-auto mt-2.5 max-w-[48ch] text-sm text-ink2">
          Give it a source, a destination and dates. Contour builds the route, the day-by-day
          schedule, stays, food, budget and packing list.
        </p>
        <Link
          href="/trips/new"
          className="mt-6 inline-block rounded bg-ink px-6 py-3 text-sm font-bold text-white no-underline hover:opacity-80"
        >
          Create my first trip
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 text-[10.5px] uppercase tracking-[0.12em] text-ink3">
        {trips.length} {trips.length === 1 ? 'trip' : 'trips'} · saved to your account
      </div>

      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-3 p-0">
        {trips.map((t) => (
          <li key={t.id} className="flex flex-col rounded border border-line">
            <div className="p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="rounded border border-line2 px-2 py-0.5 text-[9.5px] uppercase tracking-[0.12em] text-ink2">
                  {t.status}
                </span>
                <span className="text-[10.5px] text-ink3">{t.travel_mode}</span>
              </div>

              <h2 className="mt-3 text-[17px] font-bold tracking-tight">{t.trip_name}</h2>
              <p className="mt-0.5 text-[13px] text-ink2">
                {t.source} → {t.destination}
              </p>

              <dl className="mt-4 grid grid-cols-3 gap-2">
                <div>
                  <dd className="m-0 text-[13px]">{t.number_of_days}</dd>
                  <dt className="text-[9px] uppercase tracking-wide text-ink3">Days</dt>
                </div>
                <div>
                  <dd className="m-0 text-[13px]">{t.travellers}</dd>
                  <dt className="text-[9px] uppercase tracking-wide text-ink3">Pax</dt>
                </div>
                <div>
                  <dd className="m-0 text-[13px]">{t.budget_type}</dd>
                  <dt className="text-[9px] uppercase tracking-wide text-ink3">Budget</dt>
                </div>
              </dl>

              <p className="mt-3.5 border-t border-line pt-3 text-xs text-ink3">
                {fmt(t.start_date)} – {fmt(t.end_date)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
