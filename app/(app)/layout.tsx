import Link from 'next/link';
import { redirect } from 'next/navigation';
import { stackServerApp } from '@/stack';

export const dynamic = 'force-dynamic';

/**
 * Everything under (app) requires a session. Checking here rather than in each
 * page means a new screen cannot be added without the guard.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await stackServerApp.getUser();
  if (!user) redirect('/handler/sign-in');

  const name = user.displayName ?? user.primaryEmail ?? 'You';
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-line bg-bg px-5 py-3">
        <div className="flex items-baseline gap-3">
          <Link href="/trips" className="text-xl no-underline">
            Contour
          </Link>
          <span className="text-[9px] uppercase tracking-[0.16em] text-ink3">AI trip engine</span>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/trips/new"
            className="rounded bg-ink px-4 py-2 text-[13px] font-bold text-white no-underline hover:opacity-80"
          >
            + New trip
          </Link>
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-line2 text-[11px] font-bold"
            >
              {initials}
            </span>
            <div className="hidden min-w-0 sm:block">
              <div className="truncate text-[13px] font-semibold">{name}</div>
              <div className="truncate text-[11px] text-ink3">{user.primaryEmail}</div>
            </div>
          </div>
          <Link
            href="/handler/sign-out"
            className="rounded border border-line px-3 py-1.5 text-[11px] uppercase tracking-wide text-ink2 no-underline hover:border-line2"
          >
            Out
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-8">{children}</main>
    </div>
  );
}
