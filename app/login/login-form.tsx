'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Stage = 'email' | 'code';

export default function LoginForm({ oauthError }: { oauthError: string }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function post(url: string, body: object) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { ok: res.ok, data: await res.json().catch(() => ({})) };
  }

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { ok, data } = await post('/api/auth/otp/request', { email });
      if (!ok) return setError(data?.error?.message ?? 'Could not send the code.');
      setStage('code');
    } catch {
      setError('Could not reach the server. Check your connection.');
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { ok, data } = await post('/api/auth/otp/verify', { code });
      if (!ok) return setError(data?.error?.message ?? 'That code is not right.');
      router.push('/plan');
      router.refresh();
    } catch {
      setError('Could not reach the server. Check your connection.');
    } finally {
      setBusy(false);
    }
  }

  const field =
    'w-full rounded border border-line bg-white px-4 py-3.5 text-[15px] outline-none focus:border-terracotta';

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* left: the promise, kept honest */}
      <aside className="hidden flex-col justify-between bg-navy p-12 text-white lg:flex">
        <Link href="/" className="flex items-baseline gap-2.5 no-underline">
          <span className="text-[22px] font-extrabold tracking-tight text-white">Contour</span>
          <span className="text-[10px] uppercase tracking-[0.18em] text-gold">AI trip engine</span>
        </Link>
        <div>
          <h2 className="display max-w-[16ch] text-[40px]">A code, and nothing else.</h2>
          <p className="mt-5 max-w-[42ch] text-[15px] leading-relaxed text-white/70">
            No password to set. No profile. Nothing you enter is stored on a server — your trip
            lives in this browser only, and leaves when you do.
          </p>
        </div>
        <p className="text-[11px] uppercase tracking-[0.14em] text-white/40">One-time code · no account kept</p>
      </aside>

      {/* right: the form */}
      <div className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-[400px]">
          <Link href="/" className="text-[11px] uppercase tracking-[0.14em] text-ink3 no-underline hover:text-ink lg:hidden">
            ← Contour
          </Link>

          {stage === 'email' ? (
            <form onSubmit={requestCode} noValidate className="mt-6">
              <h1 className="display m-0 text-[34px]">Sign in</h1>
              <p className="mb-6 mt-2 text-[14.5px] text-ink2">
                Continue with Google, or have a six-digit code emailed to you.
              </p>

              {oauthError && <Alert>{oauthError}</Alert>}

              {/* A full page navigation, not fetch: the OAuth redirect must leave the SPA. */}
              <a
                href="/api/auth/google/start"
                className="flex w-full items-center justify-center gap-3 rounded border border-line2 bg-white py-3.5 text-[15px] font-semibold text-ink no-underline transition hover:bg-cream"
              >
                <GoogleMark />
                Continue with Google
              </a>

              <div className="my-6 flex items-center gap-3">
                <span className="h-px flex-1 bg-line" />
                <span className="text-[10px] uppercase tracking-[0.14em] text-ink3">or email</span>
                <span className="h-px flex-1 bg-line" />
              </div>

              <label className="mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-ink3" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={field}
              />

              {error && <Alert>{error}</Alert>}

              <button
                type="submit"
                disabled={busy || !email}
                className="mt-5 w-full rounded bg-terracotta py-4 text-[15px] font-bold text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {busy ? 'Sending…' : 'Send code'}
              </button>
            </form>
          ) : (
            <form onSubmit={verifyCode} noValidate className="mt-6">
              <h1 className="display m-0 text-[34px]">Check your email</h1>
              <p className="mb-7 mt-2 text-[14.5px] text-ink2">
                We sent a six-digit code to <strong className="text-ink">{email}</strong>.
              </p>

              <label className="mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-ink3" htmlFor="code">
                Six-digit code
              </label>
              <input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className={`${field} text-center text-[24px] tracking-[0.4em]`}
              />

              {error && <Alert>{error}</Alert>}

              <button
                type="submit"
                disabled={busy || code.length !== 6}
                className="mt-5 w-full rounded bg-terracotta py-4 text-[15px] font-bold text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {busy ? 'Checking…' : 'Sign in'}
              </button>

              <button
                type="button"
                onClick={() => { setStage('email'); setCode(''); setError(''); }}
                className="mt-3 w-full rounded border border-line py-3.5 text-[14px] text-ink2 transition hover:border-line2 hover:text-ink"
              >
                Use a different email
              </button>
            </form>
          )}

          <p className="mt-8 text-[12.5px] leading-relaxed text-ink3">
            Signing in creates no account and stores no record of you. The planner works the same
            either way — you can{' '}
            <a href="/prototype/" className="text-terracotta underline">
              open it without signing in
            </a>
            .
          </p>
        </div>
      </div>
    </main>
  );
}

/** Google's own mark, so the button is recognisable rather than a coloured G. */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden focusable="false">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  );
}

function Alert({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="mt-4 rounded border border-danger bg-danger/5 px-3.5 py-3 text-[13.5px] text-danger">
      {children}
    </p>
  );
}
