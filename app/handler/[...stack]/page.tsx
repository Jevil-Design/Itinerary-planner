import Link from 'next/link';
import { StackHandler } from '@stackframe/stack';
import { authConfigured, stackServerApp } from '@/stack';

export const dynamic = 'force-dynamic';

/** Stack Auth renders sign-in, sign-up, reset and OAuth callbacks here. */
export default function Handler(props: unknown) {
  if (!authConfigured()) return <AuthNotConfigured />;
  return <StackHandler fullPage app={stackServerApp()} routeProps={props as never} />;
}

/** Honest degradation rather than a crash when the server key is absent. */
function AuthNotConfigured() {
  return (
    <main className="mx-auto max-w-xl px-6 py-24">
      <h1 className="m-0 text-3xl font-normal tracking-tight">Sign-in is not set up yet</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-ink2">
        This deployment is missing <code>STACK_SECRET_SERVER_KEY</code>, so accounts, saved trips
        and sync are switched off. Everything else works.
      </p>
      <p className="mt-3 text-[15px] leading-relaxed text-ink2">
        To enable it: Neon Console → your project → <strong>Auth</strong> →{' '}
        <strong>Setup instructions</strong>, copy the secret server key, and add it to the Vercel
        project’s environment variables.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/" className="rounded border border-line2 px-5 py-3 text-sm font-semibold no-underline">
          Back to the homepage
        </Link>
        <a href="/prototype/" className="rounded bg-ink px-5 py-3 text-sm font-bold text-white no-underline hover:opacity-80">
          Open the full prototype
        </a>
      </div>
    </main>
  );
}
