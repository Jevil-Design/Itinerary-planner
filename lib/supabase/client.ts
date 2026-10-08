'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * Supabase in the browser.
 *
 * Only the publishable key is ever used here — it is designed to be public, and
 * Row Level Security is what actually protects the data. The service-role key
 * lives in lib/supabase/server.ts, which is marked `server-only` so importing it
 * from a client component fails the build rather than shipping a secret.
 */
export function browserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.',
    );
  }
  return createBrowserClient(url, key);
}

/**
 * Supabase's auth errors into something a person can act on.
 *
 * The brief is explicit that a generic "something went wrong" is not
 * acceptable, and it is right: almost every failure here has a specific cause
 * and a specific remedy. The original error is still returned to the caller for
 * logging — this only decides what the user reads.
 */
export function authMessage(error: { message?: string; status?: number; code?: string }): string {
  const m = (error.message ?? '').toLowerCase();
  const code = error.code ?? '';

  /*
   * Two different limits wear the same 429, and they need opposite advice.
   *
   * "after N seconds" is the short throttle between consecutive requests —
   * genuinely a matter of waiting. `over_email_send_rate_limit` is the mailer's
   * hourly cap, which on the built-in service is only a couple of messages;
   * telling someone to wait a minute there is simply wrong, and they will keep
   * trying and keep failing.
   */
  const seconds = m.match(/after (\d+) seconds?/);
  if (seconds) {
    return `Please wait ${seconds[1]} seconds before requesting another code.`;
  }
  if (code === 'over_email_send_rate_limit' || /email rate limit exceeded/.test(m)) {
    return 'This deployment has reached its hourly limit for sign-in emails. ' +
      'Try again later, or ask the administrator to configure a mail provider.';
  }
  if (/rate limit|too many requests/.test(m) || error.status === 429) {
    return 'Too many attempts. Wait a moment, then try again.';
  }
  if (/invalid.*email|email.*invalid|unable to validate email/.test(m)) {
    return 'That does not look like a valid email address.';
  }
  /*
   * The most common failure by far, and the one where wording matters most.
   * Supabase answers the same way whether the address is unknown or the
   * password is wrong, and that is deliberate — saying which would let anyone
   * test whether an address has an account here. The message keeps that
   * property rather than guessing.
   */
  if (code === 'invalid_credentials' || /invalid login credentials/.test(m)) {
    return 'That email and password do not match an account.';
  }
  if (code === 'user_already_exists' || /already registered|user already/.test(m)) {
    return 'An account already exists for that email. Try signing in instead.';
  }
  if (code === 'weak_password' || /password should be at least|password is too short/.test(m)) {
    return 'Choose a password of at least 8 characters.';
  }
  if (code === 'same_password' || /should be different from the old password/.test(m)) {
    return 'That is your current password. Choose a different one.';
  }
  if (code === 'email_not_confirmed' || /email not confirmed/.test(m)) {
    return 'Confirm your email address first — check your inbox for the link we sent.';
  }
  if (code === 'signup_disabled' || /signups not allowed/.test(m)) {
    return 'New accounts are turned off for this deployment. Contact the administrator.';
  }
  if (/expired|invalid.*token/.test(m)) {
    return 'That link has expired or was already used. Request a new one.';
  }
  // Fall back to Supabase's own wording rather than inventing one: it is
  // usually more specific than anything generic we could substitute.
  return error.message || 'Sign-in failed. Please try again.';
}
