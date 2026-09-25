import Link from 'next/link';
import NextImage from 'next/image';
import { currentSession } from '@/lib/session';
import imagery from './imagery.json';

export const dynamic = 'force-dynamic';

type Photo = {
  key: string; label: string; title: string; src: string;
  width: number; height: number; licence: string; author: string; page: string;
};

const images = imagery.images as Photo[];
const pick = (key: string) => images.find((i) => i.key === key) ?? images[0];

const STEPS = [
  { n: '01', t: 'Tell it where', d: 'Source, destination, dates. That is the whole form — everything after it only sharpens the result.' },
  { n: '02', t: 'It builds the shape', d: 'Days with real dates, the route between them, a packing list keyed to how you travel, and the budget lines worth filling in.' },
  { n: '03', t: 'You edit anything', d: 'Drag activities between days, change a time, rewrite a budget line. Totals recalculate as you go.' },
  { n: '04', t: 'Take it with you', d: 'Every recommendation carries its source, so you always know what is checked and what is a suggestion.' },
];

const FAQ = [
  {
    q: 'Does it book anything for me?',
    a: 'No. Contour plans and organises. Booking stays with you and the provider, which is why nothing here is presented as a confirmed reservation.',
  },
  {
    q: 'How do I know what to trust?',
    a: 'Every row is labelled. A green tick means a live source backed it. An estimate marker means the model suggested it and you should verify before you pay for anything.',
  },
  {
    q: 'Is my trip saved?',
    a: 'No. Nothing you enter is stored on a server. Your trip lives in this browser for as long as the tab is open, and it is gone when you leave. Export it before you close.',
  },
  {
    q: 'Why sign in at all, then?',
    a: 'A one-time code on your email, and nothing else. No password to remember, no profile, no history kept.',
  },
];

export default async function Landing() {
  const user = await currentSession();
  const hero = pick('sikkim');

  return (
    <div className="bg-bg">
      <Header signedIn={Boolean(user)} />

      {/* ---------------- hero ---------------- */}
      <section className="relative isolate overflow-hidden bg-navy text-white">
        <NextImage
          src={hero.src}
          alt={hero.label}
          fill
          priority
          sizes="100vw"
          className="-z-10 object-cover opacity-40"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-navy/80 via-navy/70 to-navy" />

        <div className="mx-auto max-w-content px-5 py-24 sm:py-32">
          <p className="text-[11px] uppercase tracking-[0.2em] text-gold">Source · destination · dates</p>
          <h1 className="display mt-5 max-w-[16ch] text-[clamp(38px,7vw,68px)]">
            Plan the whole trip in minutes.
          </h1>
          <p className="mt-6 max-w-[52ch] text-[17px] leading-relaxed text-white/75">
            Contour turns three fields into a day-by-day plan — the route, the schedule, what to pack
            and what it costs. You edit anything, and it never invents a hotel to fill a gap.
          </p>

          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              href={user ? '/plan' : '/login'}
              className="rounded bg-terracotta px-7 py-4 text-[15px] font-bold text-white no-underline transition hover:opacity-90"
            >
              Start planning
            </Link>
            <a
              href="/prototype/"
              className="rounded border border-white/25 px-7 py-4 text-[15px] font-semibold text-white no-underline transition hover:bg-white/10"
            >
              See it working
            </a>
          </div>

          <p className="mt-10 text-[11px] uppercase tracking-[0.16em] text-white/45">Popular starts</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {['darjeeling', 'goa', 'ladakh', 'kerala', 'jaipur'].map((k) => (
              <span
                key={k}
                className="rounded-pill border border-white/20 px-4 py-2 text-[13px] text-white/85"
              >
                {pick(k).label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- what it does ---------------- */}
      <section className="mx-auto max-w-content px-5 py-20">
        <div className="grid gap-x-10 gap-y-12 md:grid-cols-3">
          {[
            ['Nine modules, one generate', 'Route, days, stays, food, sightseeing, budget, expenses, packing and a pre-trip checklist.'],
            ['Built for how you travel', 'A bike trip gets a helmet and a chain-lube reminder. A flight gets a cabin liquids bag. The plan follows the mode.'],
            ['Nothing invented', 'Where there is no live source, the field stays empty and says so rather than filling itself with a plausible guess.'],
          ].map(([t, d]) => (
            <div key={t}>
              <h3 className="text-[19px] font-bold tracking-tight">{t}</h3>
              <p className="mt-2.5 text-[15px] leading-relaxed text-ink2">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- how it works ---------------- */}
      <section className="bg-cream">
        <div className="mx-auto max-w-content px-5 py-20">
          <h2 className="display text-[clamp(28px,4vw,42px)]">How it works</h2>
          <div className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <div key={s.n}>
                <div className="text-[12px] font-bold tracking-[0.18em] text-terracotta">{s.n}</div>
                <h3 className="mt-3 text-[18px] font-bold tracking-tight">{s.t}</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-ink2">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- destinations ---------------- */}
      <section className="mx-auto max-w-content px-5 py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="display text-[clamp(28px,4vw,42px)]">Somewhere to start</h2>
          <p className="max-w-[46ch] text-[14.5px] text-ink2">
            Starting points, not packages. Pick one and the planner fills in the days — or type
            anywhere else entirely.
          </p>
        </div>

        <ul className="mt-10 grid list-none grid-cols-1 gap-6 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {images.slice(0, 6).map((img) => (
            <li key={img.key} className="group overflow-hidden rounded-card border border-line bg-bg shadow-card">
              <div className="aspect-[4/3] overflow-hidden bg-sand">
                <NextImage
                  src={img.src}
                  alt={img.label}
                  width={img.width}
                  height={img.height}
                  sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                />
              </div>
              <div className="p-5">
                <h3 className="text-[17px] font-bold tracking-tight">{img.label}</h3>
                <Link
                  href={user ? '/plan' : '/login'}
                  className="mt-3 inline-block text-[14px] font-semibold text-terracotta no-underline hover:underline"
                >
                  Plan this trip →
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------------- faq ---------------- */}
      <section className="bg-cream">
        <div className="mx-auto max-w-content px-5 py-20">
          <h2 className="display text-[clamp(28px,4vw,42px)]">Straight answers</h2>
          <dl className="mt-10 grid gap-x-12 gap-y-8 md:grid-cols-2">
            {FAQ.map((f) => (
              <div key={f.q}>
                <dt className="text-[17px] font-bold tracking-tight">{f.q}</dt>
                <dd className="mt-2 text-[15px] leading-relaxed text-ink2">{f.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ---------------- closing ---------------- */}
      <section className="bg-navy text-white">
        <div className="mx-auto max-w-content px-5 py-24 text-center">
          <h2 className="display mx-auto max-w-[18ch] text-[clamp(30px,5vw,52px)]">
            Give it a source and a destination.
          </h2>
          <p className="mx-auto mt-5 max-w-[48ch] text-[16px] text-white/70">
            It builds the rest, and tells you plainly which parts it could not check.
          </p>
          <Link
            href={user ? '/plan' : '/login'}
            className="mt-9 inline-block rounded bg-terracotta px-8 py-4 text-[15px] font-bold text-white no-underline transition hover:opacity-90"
          >
            Start planning
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}

function Header({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-navy/95 backdrop-blur">
      <div className="mx-auto flex max-w-content flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-4">
        <Link href="/" className="flex items-baseline gap-2.5 no-underline">
          <span className="text-[22px] font-extrabold tracking-tight text-white">Contour</span>
          <span className="text-[10px] uppercase tracking-[0.18em] text-gold">AI trip engine</span>
        </Link>
        <nav className="flex flex-wrap items-center gap-2">
          {signedIn ? (
            <Link href="/plan" className="rounded border border-white/25 px-5 py-2.5 text-[14px] font-semibold text-white no-underline hover:bg-white/10">
              My trips
            </Link>
          ) : (
            <Link href="/login" className="rounded border border-white/25 px-5 py-2.5 text-[14px] font-semibold text-white no-underline hover:bg-white/10">
              Log in
            </Link>
          )}
          <Link
            href={signedIn ? '/plan' : '/login'}
            className="rounded bg-terracotta px-5 py-2.5 text-[14px] font-bold text-white no-underline hover:opacity-90"
          >
            Start planning
          </Link>
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-line bg-bg">
      <div className="mx-auto max-w-content px-5 py-12">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <span className="text-[20px] font-extrabold tracking-tight">Contour</span>
          <a href="/prototype/" className="text-[14px] font-semibold text-terracotta no-underline hover:underline">
            Open the planner →
          </a>
        </div>

        <p className="mt-8 max-w-[70ch] text-[13px] leading-relaxed text-ink2">
          Nothing you enter is stored on a server. Your trip lives in this browser only, and is gone
          when you close the tab.
        </p>

        {/* Real photographs of real places. Their licences require credit, so it is given. */}
        <div className="mt-6 border-t border-line pt-6">
          <p className="text-[11px] uppercase tracking-[0.14em] text-ink3">Photography</p>
          <p className="mt-2 text-[12px] leading-relaxed text-ink3">
            {images.map((img, i) => (
              <span key={img.key}>
                {i > 0 && ' · '}
                <a href={img.page} target="_blank" rel="noreferrer noopener" className="text-ink3 underline">
                  {img.label}
                </a>{' '}
                ({img.licence})
              </span>
            ))}{' '}
            — via Wikimedia Commons.
          </p>
        </div>
      </div>
    </footer>
  );
}
