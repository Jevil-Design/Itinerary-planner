import { cookies } from 'next/headers';
import { checkState, exchangeCode, issueSession, STATE_COOKIE, googleConfigured } from '@/lib/google';
import { SESSION_COOKIE, cookieOptions } from '@/lib/otp';

export const dynamic = 'force-dynamic';

const back = (req: Request, error: string) =>
  Response.redirect(new URL(`/login?error=${error}`, req.url), 303);

export async function GET(req: Request) {
  if (!googleConfigured()) return back(req, 'google_unconfigured');

  const params = new URL(req.url).searchParams;
  // Google reports a refusal here rather than by failing the redirect
  if (params.get('error')) return back(req, 'google_denied');

  const jar = await cookies();
  const state = checkState(jar.get(STATE_COOKIE)?.value, params.get('state'));
  jar.delete(STATE_COOKIE);
  if (!state.ok) return back(req, `google_state_${state.reason}`);

  const code = params.get('code');
  if (!code) return back(req, 'google_no_code');

  const result = await exchangeCode(code, state.verifier, req);
  if ('error' in result) {
    console.error('[google/callback]', result.error, 'detail' in result ? result.detail : '');
    return back(req, 'google_exchange_failed');
  }

  jar.set(SESSION_COOKIE, issueSession(result.email), { ...cookieOptions, maxAge: 12 * 3600 });
  return Response.redirect(new URL(state.next, req.url), 303);
}
