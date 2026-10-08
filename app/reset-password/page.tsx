'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { browserClient, authMessage } from '@/lib/supabase/client';
import { PasswordField, Alert, passwordProblem, MIN_PASSWORD } from '../login/fields';

/**
 * Setting a new password after following a reset link.
 *
 * The link lands on /auth/callback first, which exchanges it for a session.
 * By the time this page renders the user is already authenticated, so the new
 * password is set with updateUser — there is no token handled here, and no
 * token to get wrong.
 *
 * Arriving without that session means the link expired or was never followed,
 * which is checked rather than assumed: otherwise the form would appear to work
 * and then fail on submit.
 */
export default function ResetPassword() {
  const router = useRouter();
  const [ready, setReady] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await browserClient().auth.getUser();
        if (!cancelled) setReady(Boolean(data.user));
      } catch {
        if (!cancelled) setReady(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const problem = passwordProblem(password, confirm);
    if (problem) return setError(problem);

    setBusy(true);
    try {
      const supabase = browserClient();
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) {
        console.error('[reset-password] updateUser', err.status, err.code);
        setError(authMessage(err));
        return;
      }
      // Sign out everywhere so an old session cannot keep using the account
      // with the password the user just replaced.
      await supabase.auth.signOut();
      router.push('/login?notice=' + encodeURIComponent('Password updated. Sign in with your new password.'));
    } catch (err) {
      console.error('[reset-password] threw', err);
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
            {ready === null ? (
              <p className="text-[14.5px] text-ink2">Checking your link…</p>
            ) : !ready ? (
              <>
                <h1 className="display m-0 text-[34px]">Link expired</h1>
                <p className="mb-6 mt-2 text-[14.5px] text-ink2">
                  That reset link has expired or was already used. Request a new one.
                </p>
                <Link
                  href="/forgot-password"
                  className="inline-block rounded bg-terracotta px-6 py-3.5 text-[15px] font-bold text-white no-underline"
                >
                  Send a new link
                </Link>
              </>
            ) : (
              <form onSubmit={submit} noValidate>
                <h1 className="display m-0 text-[34px]">New password</h1>
                <p className="mb-6 mt-2 text-[14.5px] text-ink2">
                  Choose a password you don&rsquo;t use anywhere else.
                </p>

                {error && <Alert>{error}</Alert>}

                <PasswordField
                  id="password"
                  label="New password"
                  value={password}
                  onChange={setPassword}
                  autoComplete="new-password"
                  hint={`At least ${MIN_PASSWORD} characters.`}
                />

                <div className="mt-4">
                  <PasswordField
                    id="confirm"
                    label="Confirm new password"
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
                  {busy ? 'Updating…' : 'Update password'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
