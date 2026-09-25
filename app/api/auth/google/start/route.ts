import { cookies } from 'next/headers';
import { googleConfigured, startAuth, STATE_COOKIE } from '@/lib/google';
import { cookieOptions } from '@/lib/otp';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!googleConfigured()) {
    // A dead button is worse than an honest one; say why on the page they came from.
    return Response.redirect(new URL('/login?error=google_unconfigured', req.url), 303);
  }

  const next = new URL(req.url).searchParams.get('next') ?? '/plan';
  const { url, cookie } = startAuth(req, next);
  (await cookies()).set(STATE_COOKIE, cookie, { ...cookieOptions, maxAge: 600 });
  return Response.redirect(url, 303);
}
