import { NextResponse } from 'next/server';
import { userClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Ends the Supabase session and clears its cookies.
 *
 * POST only: a sign-out reachable by GET can be fired by an <img> tag on
 * another site, which is a nuisance attack but a real one.
 *
 * Redirects rather than returning JSON because the dashboard signs out with a
 * plain form, which works without JavaScript.
 */
export async function POST(request: Request) {
  const supabase = await userClient();
  const { error } = await supabase.auth.signOut();
  if (error) console.error('[signout]', error.status, error.message);
  return NextResponse.redirect(new URL('/', request.url), { status: 303 });
}
