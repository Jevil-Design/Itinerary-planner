import 'server-only';
import { StackServerApp } from '@stackframe/stack';

/**
 * Neon Auth is Stack Auth underneath. Provisioning it registered the JWKS with
 * the database, which is what lets pg_session_jwt resolve auth.user_id() inside
 * the RLS policies.
 *
 * Constructed LAZILY, deliberately. StackServerApp throws when
 * STACK_SECRET_SERVER_KEY is absent, and at module scope that throw happens
 * during `next build` — which failed every production deploy and left Vercel
 * serving a stale build. Nothing else in the app needs the key, so the build,
 * the landing page and the prototype should not be held hostage by it.
 */

export function authConfigured(): boolean {
  return Boolean(
    process.env.STACK_SECRET_SERVER_KEY?.trim() &&
      process.env.NEXT_PUBLIC_STACK_PROJECT_ID?.trim() &&
      process.env.NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY?.trim(),
  );
}

// Built through a factory so the generic parameter StackProvider expects is
// inferred; annotating the return type as plain StackServerApp loses it.
function create() {
  return new StackServerApp({
    tokenStore: 'nextjs-cookie',
    urls: {
      signIn: '/handler/sign-in',
      signUp: '/handler/sign-up',
      afterSignIn: '/trips',
      afterSignUp: '/trips',
      afterSignOut: '/',
    },
  });
}

let cached: ReturnType<typeof create> | null = null;

/** Throws when auth is unconfigured. Call authConfigured() first, or tryGetUser(). */
export function stackServerApp() {
  if (!authConfigured()) {
    throw new Error(
      'Auth is not configured. Set STACK_SECRET_SERVER_KEY (Neon Console → Auth → ' +
        'Setup instructions) alongside the two NEXT_PUBLIC_STACK_* values.',
    );
  }
  cached ??= create();
  return cached;
}

/** Null when there is no session OR auth is not configured. Never throws. */
export async function tryGetUser() {
  if (!authConfigured()) return null;
  try {
    return await stackServerApp().getUser();
  } catch {
    return null;
  }
}
