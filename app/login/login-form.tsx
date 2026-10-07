'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { browserClient, authMessage } from '@/lib/supabase/client';

/**
 * Sign-in: an emailed code, and nothing else.
 *
 * This goes through Supabase Auth rather than the previous custom sender. That
 * is the fix for codes only ever reaching one address — the old path used a
 * shared sandbox sender that refuses any recipient but the account owner, while
 * Supabase sends to anyone.
 *
 * The code field also accepts a link: if the project's email template sends a
 * magic link instead of a six-digit token, that link lands on /auth/callback
 * and signs the user in there. Which of the two arrives is a dashboard setting,
 * so both are supported.
 */

type Stage = 'email' | 'code';

const RESEND_SECONDS = 45;

export default function LoginForm({ initialError = '' }: { initialError?: string }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState(initialError);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  // Countdown for the resend link, so the button is not simply dead.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    if (stage === 'code') codeRef.current?.focus();
  }, [stage]);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    setError('');
    setNotice('');
    const address = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) {
      setError('Please enter a valid email address.');
      return;
    }

    setBusy(true);
    try {
      const supabase = browserClient();
      const { error: err } = await supabase.auth.signInWithOtp({
        email: address,
        options: {
          shouldCreateUser: true,
          // Only used if the template sends a link rather than a code.
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (err) {
        // The real error is kept for the console; the user gets the mapped one.
        console.error('[login] signInWithOtp', err.status, err.code, err.message);
        setError(authMessage(err));
        return;
      }
      setStage('code');
      setCooldown(RESEND_SECONDS);
      setNotice(`We sent a code to ${address}. It may take a moment, and it can land in spam.`);
    } catch (err) {
      console.error('[login] signInWithOtp threw', err);
      setError("We couldn't reach the sign-in service. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const token = code.replace(/\D/g, '');
    if (token.length !== 6) {
      setError('Enter the six digits from the email.');
      return;
    }

    setBusy(true);
    try {
      const supabase = browserClient();
      const { error: err } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token,
        type: 'email',
      });
      if (err) {
        console.error('[login] verifyOtp', err.status, err.code, err.message);
        setError(authMessage(err));
        return;
      }
      // refresh() so the server re-reads the new session cookie before we move.
      router.refresh();
      router.push('/dashboard');
    } catch (err) {
      console.error('[login] verifyOtp threw', err);
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

          {stage === 'email' ? (
            <form onSubmit={sendCode} noValidate className="mt-6">
              <h1 className="display m-0 text-[34px]">Sign in</h1>
              <p className="mb-6 mt-2 text-[14.5px] text-ink2">
                Enter your email and we&rsquo;ll send you a six-digit code. No password.
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
                {busy ? 'Sending…' : 'Send code'}
              </button>
            </form>
          ) : (
            <form onSubmit={verify} noValidate className="mt-6">
              <h1 className="display m-0 text-[34px]">Check your email</h1>
              <p className="mb-6 mt-2 text-[14.5px] text-ink2">
                We sent a verification code to <strong className="text-ink">{email}</strong>.
              </p>

              {error && <Alert>{error}</Alert>}
              {notice && !error && (
                <p className="mt-4 rounded border border-line2 bg-sand/40 px-3.5 py-3 text-[13.5px] text-ink2">
                  {notice}
                </p>
              )}

              <label className="mb-1.5 mt-4 block text-[10px] uppercase tracking-[0.14em] text-ink3" htmlFor="code">
                Six-digit code
              </label>
              <input
                id="code"
                ref={codeRef}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="______"
                className="w-full rounded border border-line2 bg-white px-3.5 py-3.5 text-center text-[22px] tracking-[0.5em] text-ink outline-none focus:border-ink"
              />

              <button
                type="submit"
                disabled={busy}
                className="mt-5 w-full rounded bg-terracotta py-3.5 text-[15px] font-bold text-white transition disabled:opacity-60"
              >
                {busy ? 'Verifying…' : 'Verify'}
              </button>

              <div className="mt-5 flex items-center justify-between text-[13px]">
                <button
                  type="button"
                  disabled={cooldown > 0 || busy}
                  onClick={() => sendCode()}
                  className="bg-transparent p-0 font-semibold text-terracotta disabled:text-ink3"
                >
                  {cooldown > 0 ? `Resend available in ${cooldown}s` : 'Resend code'}
                </button>
                <button
                  type="button"
                  onClick={() => { setStage('email'); setCode(''); setError(''); setNotice(''); }}
                  className="bg-transparent p-0 font-semibold text-ink3"
                >
                  Change email
                </button>
              </div>

              <p className="mt-6 text-[12.5px] leading-relaxed text-ink3">
                If the email contains a link rather than a code, opening the link signs you
                in too.
              </p>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}

function Alert({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="mt-4 rounded border border-danger bg-danger/5 px-3.5 py-3 text-[13.5px] text-danger">
      {children}
    </p>
  );
}
