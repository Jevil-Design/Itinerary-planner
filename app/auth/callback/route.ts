import { NextResponse } from 'next/server';
import { userClient } from '@/lib/supabase/server';

/**
 * Where an emailed sign-in link lands.
 *
 * Supabase sends one of two things depending on the project's email template:
 * a link carrying a PKCE `code`, or one carrying a `token_hash` and `type`.
 * Both are handled, because which arrives is a dashboard setting rather than
 * something this code controls, and a link that works everywhere is worth more
 * than one that assumes a configuration.
 *
 * The exchange happens here, on the server, so the session cookie is set
 * httpOnly and is never readable by script.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');

  // Clamped to a same-site path: an absolute or protocol-relative value here
  // would turn the sign-in link into an open redirect.
  const raw = url.searchParams.get('next') ?? '/dashboard';
  const next = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/dashboard';

  const fail = (reason: string) =>
    NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(reason)}`, url.origin));

  const supabase = await userClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error('[auth/callback] code exchange failed', error.status, error.message);
      return fail('That sign-in link has expired or was already used. Request a new one.');
    }
    return NextResponse.redirect(new URL(next, url.origin));
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as 'email' | 'magiclink' | 'signup' | 'recovery' | 'invite',
      token_hash: tokenHash,
    });
    if (error) {
      console.error('[auth/callback] token verification failed', error.status, error.message);
      return fail('That sign-in link has expired or was already used. Request a new one.');
    }
    return NextResponse.redirect(new URL(next, url.origin));
  }

  return fail('That sign-in link was incomplete. Request a new one.');
}
