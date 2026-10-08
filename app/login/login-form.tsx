'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { browserClient, authMessage } from '@/lib/supabase/client';
import { PasswordField, Alert, Notice } from './fields';

/**
 * Sign in with an email address and a password, through Supabase Auth.
 *
 * No password is ever hashed, stored or compared here. Supabase holds the
 * credential; this form only hands it over and reads the answer. That is the
 * point of using the platform's auth rather than rolling one.
 */
export default function LoginForm({
  initialError = '',
  next = '/dashboard',
  notice = '',
}: {
  initialError?: string;
  next?: string;
  notice?: string;
}) {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);

  /*
   * next and notice arrive as props from the server page rather than through
   * useSearchParams. That hook opts the whole subtree out of server rendering,
   * which left /login shipping 8 KB with no form in it — the fields appeared
   * only once JavaScript had run.
   */

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const address = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!password) {
      setError('Enter your password.');
      return;
    }

    setBusy(true);
    try {
      const supabase = browserClient();
      const { error: err } = await supabase.auth.signInWithPassword({
        email: address,
        password,
      });
      if (err) {
        // The real error goes to the console; the user reads the mapped one.
        // Never the password, and never which half of the pair was wrong.
        console.error('[login] signInWithPassword', err.status, err.code);
        setError(authMessage(err));
        return;
      }
      router.refresh();
      router.push(next);
    } catch (err) {
      console.error('[login] signInWithPassword threw', err);
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

          <form onSubmit={submit} noValidate className="mt-6">
            <h1 className="display m-0 text-[34px]">Sign in</h1>
            <p className="mb-6 mt-2 text-[14.5px] text-ink2">
              Welcome back. Plan better, travel smarter.
            </p>

            {error && <Alert>{error}</Alert>}
            {notice && !error && <Notice>{notice}</Notice>}

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

            <div className="mt-4">
              <PasswordField
                id="password"
                label="Password"
                value={password}
                onChange={setPassword}
                autoComplete="current-password"
              />
            </div>

            <div className="mt-2 text-right">
              <Link href="/forgot-password" className="text-[13px] font-semibold text-terracotta no-underline hover:underline">
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="mt-5 w-full rounded bg-terracotta py-3.5 text-[15px] font-bold text-white transition disabled:opacity-60"
            >
              {busy ? 'Signing in…' : 'Log in'}
            </button>

            <p className="mt-6 text-center text-[13.5px] text-ink2">
              Don&rsquo;t have an account?{' '}
              <Link href={`/signup?next=${encodeURIComponent(next)}`} className="font-semibold text-terracotta no-underline hover:underline">
                Create account
              </Link>
            </p>
          </form>
        </div>
      </div>
    </main>
  );
}
