import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Keeps the Supabase session alive, and guards the routes that need one.
 *
 * Access tokens are short-lived. A Server Component cannot write cookies, so
 * nothing there can refresh one — which is why the refresh happens here, where
 * the response is still being built. Without this, a signed-in user silently
 * becomes signed-out after an hour.
 *
 * The session is read with getUser(), which verifies the token against the auth
 * server. getSession() only decodes the cookie, so it will happily accept one a
 * user has edited; it is not a basis for an access decision.
 */

const PROTECTED = ['/dashboard', '/trips', '/plan'];
// Signed-in users have no business on these; they get the dashboard instead.
// /reset-password is deliberately absent: arriving there WITH a session is the
// normal case, because the emailed link signs you in before you set the new one.
const AUTH_PAGES = ['/login', '/signup', '/forgot-password'];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  // Without Supabase configured there is no session to refresh and nothing to
  // guard; let the request through rather than failing every page.
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const user = data.user;
  const path = request.nextUrl.pathname;

  if (!user && PROTECTED.some((p) => path === p || path.startsWith(p + '/'))) {
    const to = request.nextUrl.clone();
    to.pathname = '/login';
    // So the user lands where they were going, not on a generic page.
    to.searchParams.set('next', path);
    return NextResponse.redirect(to);
  }

  if (user && AUTH_PAGES.includes(path)) {
    const to = request.nextUrl.clone();
    to.pathname = '/dashboard';
    to.search = '';
    return NextResponse.redirect(to);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and images. Running on those would cost a
     * token refresh per file for no benefit.
     */
    '/((?!_next/static|_next/image|favicon.ico|photos|prototype|.*\\.(?:svg|png|jpg|jpeg|gif|webp|js|css)$).*)',
  ],
};
