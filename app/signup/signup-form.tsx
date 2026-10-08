'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { browserClient, authMessage } from '@/lib/supabase/client';
import { PasswordField, Alert, Notice, passwordProblem, MIN_PASSWORD } from '../login/fields';

/**
 * Creating an account.
 *
 * The full name is passed as user metadata, which the signup trigger copies
 * into the profile row. Doing it there rather than with a second insert from
 * here means a profile cannot be missed if the browser closes mid-flow, and the
 * client never gets to choose the row's id.
 */
export default function SignupForm({ next = '/dashboard' }: { next?: string }) {
  const router = useRouter();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const name = fullName.trim();
    const address = email.trim();
    if (name.length < 2) return setError('Please enter your name.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) {
      return setError('Please enter a valid email address.');
    }
    const problem = passwordProblem(password, confirm);
    if (problem) return setError(problem);

    setBusy(true);
    try {
      const supabase = browserClient();
      const { data, error: err } = await supabase.auth.signUp({
        email: address,
        password,
        options: {
          data: { full_name: name },
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (err) {
        console.error('[signup] signUp', err.status, err.code);
        setError(authMessage(err));
        return;
      }

      /*
       * Whether a session comes back depends on a project setting. With email
       * confirmation off the user is signed in immediately; with it on they
       * must click the link first. Both are handled rather than assuming one,
       * because the setting can change without this code changing.
       */
      if (data.session) {
        router.refresh();
        router.push(next);
        return;
      }
      setSent(address);
    } catch (err) {
      console.error('[signup] signUp threw', err);
      setError("We couldn't reach the sign-in service. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <Shell>
        <h1 className="display m-0 text-[34px]">Check your email</h1>
        <p className="mb-6 mt-2 text-[14.5px] text-ink2">
          We sent a confirmation link to <strong className="text-ink">{sent}</strong>. Open it to
          finish creating your account.
        </p>
        <Notice>It can take a minute, and it sometimes lands in spam.</Notice>
        <p className="mt-6 text-center text-[13.5px] text-ink2">
          <Link href="/login" className="font-semibold text-terracotta no-underline hover:underline">
            Back to sign in
          </Link>
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <form onSubmit={submit} noValidate>
        <h1 className="display m-0 text-[34px]">Create account</h1>
        <p className="mb-6 mt-2 text-[14.5px] text-ink2">
          Plan a trip, keep it, and pick it up on any device.
        </p>

        {error && <Alert>{error}</Alert>}

        <label className="mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-ink3" htmlFor="name">
          Full name
        </label>
        <input
          id="name"
          autoComplete="name"
          autoFocus
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Your name"
          className="w-full rounded border border-line2 bg-white px-3.5 py-3.5 text-[15px] text-ink outline-none focus:border-ink"
        />

        <label className="mb-1.5 mt-4 block text-[10px] uppercase tracking-[0.14em] text-ink3" htmlFor="email">
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
          className="w-full rounded border border-line2 bg-white px-3.5 py-3.5 text-[15px] text-ink outline-none focus:border-ink"
        />

        <div className="mt-4">
          <PasswordField
            id="password"
            label="Password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            hint={`At least ${MIN_PASSWORD} characters.`}
          />
        </div>

        <div className="mt-4">
          <PasswordField
            id="confirm"
            label="Confirm password"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
          />
        </div>

        <button
          type="submit"
          disabled={busy}
          className="mt-5 w-full rounded bg-terracotta py-3.5 text-[15px] font-bold text-white transition disabled:opacity-60"
        >
          {busy ? 'Creating account…' : 'Create account'}
        </button>

        <p className="mt-6 text-center text-[13.5px] text-ink2">
          Already have an account?{' '}
          <Link href="/login" className="font-semibold text-terracotta no-underline hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-bg">
      <div className="mx-auto flex max-w-content items-center justify-center px-5 py-16">
        <div className="w-full max-w-[400px]">
          <Link href="/" className="text-[20px] font-extrabold tracking-tight text-ink no-underline">
            Contour
          </Link>
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </main>
  );
}
