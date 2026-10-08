'use client';

import Link from 'next/link';
import { useState } from 'react';
import { browserClient, authMessage } from '@/lib/supabase/client';
import { Alert, Notice } from '../login/fields';

/**
 * Starting a password reset.
 *
 * Supabase issues and verifies the reset token; none of that is implemented
 * here, which is the point — a hand-rolled reset token is one of the easiest
 * things in an application to get subtly wrong.
 *
 * The confirmation is shown whether or not the address has an account. Saying
 * "no account found" would turn this page into a way to test which addresses
 * are registered.
 */
export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const address = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) {
      return setError('Please enter a valid email address.');
    }

    setBusy(true);
    try {
      const supabase = browserClient();
      const { error: err } = await supabase.auth.resetPasswordForEmail(address, {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      });
      if (err) {
        console.error('[forgot-password]', err.status, err.code);
        // A rate limit is worth surfacing; anything else is swallowed so the
        // page cannot be used to probe for registered addresses.
        if (err.status === 429) {
          setError(authMessage(err));
          return;
        }
      }
      setSent(true);
    } catch (err) {
      console.error('[forgot-password] threw', err);
      setError("We couldn't reach the sign-in service. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-bg">
      <div className="mx-auto flex max-w-content items-center justify-center px-5 py-16">
        <div className="w-full max-w-[400px]">
          <Link href="/" className="text-[20px] font-extrabold tracking-tight text-ink no-underline">
            Contour
          </Link>

          <div className="mt-6">
            {sent ? (
              <>
                <h1 className="display m-0 text-[34px]">Check your email</h1>
                <p className="mb-6 mt-2 text-[14.5px] text-ink2">
                  If an account exists for <strong className="text-ink">{email.trim()}</strong>,
                  we&rsquo;ve sent a link to reset its password.
                </p>
                <Notice>It can take a minute, and it sometimes lands in spam.</Notice>
                <p className="mt-6 text-center text-[13.5px]">
                  <Link href="/login" className="font-semibold text-terracotta no-underline hover:underline">
                    Back to sign in
                  </Link>
                </p>
              </>
            ) : (
              <form onSubmit={submit} noValidate>
                <h1 className="display m-0 text-[34px]">Reset password</h1>
                <p className="mb-6 mt-2 text-[14.5px] text-ink2">
                  Enter your email and we&rsquo;ll send you a link to set a new password.
                </p>

                {error && <Alert>{error}</Alert>}

                <label className="mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-ink3" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoFocus
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded border border-line2 bg-white px-3.5 py-3.5 text-[15px] text-ink outline-none focus:border-ink"
                />

                <button
                  type="submit"
                  disabled={busy}
                  className="mt-5 w-full rounded bg-terracotta py-3.5 text-[15px] font-bold text-white transition disabled:opacity-60"
                >
                  {busy ? 'Sending…' : 'Send reset link'}
                </button>

                <p className="mt-6 text-center text-[13.5px] text-ink2">
                  <Link href="/login" className="font-semibold text-terracotta no-underline hover:underline">
                    Back to sign in
                  </Link>
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
