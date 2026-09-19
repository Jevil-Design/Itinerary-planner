import 'server-only';
import { StackServerApp } from '@stackframe/stack';

/**
 * Neon Auth is Stack Auth under the covers. Provisioning it created the project
 * and registered its JWKS with the database, which is what lets pg_session_jwt
 * resolve auth.user_id() inside RLS policies.
 *
 * Reads NEXT_PUBLIC_STACK_PROJECT_ID, NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY
 * and STACK_SECRET_SERVER_KEY from the environment.
 */
export const stackServerApp = new StackServerApp({
  tokenStore: 'nextjs-cookie',
  urls: {
    signIn: '/handler/sign-in',
    signUp: '/handler/sign-up',
    afterSignIn: '/trips',
    afterSignUp: '/trips',
    afterSignOut: '/',
  },
});
