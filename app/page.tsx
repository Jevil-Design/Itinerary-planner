import Link from 'next/link';
import { stackServerApp } from '@/stack';

export const dynamic = 'force-dynamic';

export default async function Landing() {
  const user = await stackServerApp.getUser();

  return (
    <main className="mx-auto max-w-5xl px-6 pb-24">
      {/* Wraps, because at 320px the brand and the two actions do not fit on
          one line and the nav pushed 28px past the viewport. */}
      <header className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 py-6">
        <div className="flex items-baseline gap-3">
          <span className="text-2xl">Contour</span>
          <span className="text-[10px] uppercase tracking-[0.18em] text-ink3">AI trip engine</span>
        </div>
        <nav className="flex flex-wrap items-center gap-2">
          {user ? (
            <Link href="/trips" className="rounded border border-line2 px-4 py-2 text-sm font-semibold no-underline">
              My trips
            </Link>
          ) : (
            <>
              <Link href="/handler/sign-in" className="rounded border border-line px-4 py-2 text-sm font-semibold no-underline">
                Log in
              </Link>
              <Link href="/handler/sign-up" className="rounded bg-ink px-5 py-2 text-sm font-bold text-white no-underline hover:opacity-80">
                Create my trip
              </Link>
            </>
          )}
        </nav>
      </header>

      <section className="grid items-center gap-12 py-14 md:grid-cols-2">
        <div>
          <h1 className="m-0 text-[clamp(40px,6vw,66px)] font-normal leading-[1.03] tracking-tight">
            Plan your entire trip with AI
          </h1>
          <p className="mt-5 max-w-[44ch] text-lg leading-relaxed text-ink2">
            Enter your source, destination and travel dates. Get a complete personalised itinerary,
            saved to your account and there on every device.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={user ? '/trips/new' : '/handler/sign-up'}
              className="rounded bg-ink px-6 py-3.5 text-[15px] font-bold text-white no-underline hover:opacity-80"
            >
              {user ? 'Create a trip' : 'Create my trip'}
            </Link>
            <a href="/prototype/" className="rounded border border-line2 px-6 py-3.5 text-[15px] font-semibold no-underline">
              View the design prototype
            </a>
          </div>
        </div>

        <ul className="m-0 grid list-none grid-cols-2 gap-px overflow-hidden rounded border border-line bg-line p-0">
          {[
            'Trip details validated', 'Route analyzed', 'Travel time calculated',
            'Overnight locations selected', 'Finding attractions', 'Finding hotels',
            'Finding restaurants', 'Checking weather', 'Optimizing daily schedule',
            'Calculating budget', 'Creating packing list', 'Saving trip',
          ].map((step, i) => (
            <li key={step} className="flex items-center gap-2.5 bg-white px-3 py-2.5">
              <span className="font-mono text-[10px] text-ink3">{String(i + 1).padStart(2, '0')}</span>
              <span className="text-[12.5px] leading-snug">{step}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
