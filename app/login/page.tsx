import LoginForm from './login-form';

/**
 * Sign-in is a six-digit code by email, and nothing else.
 *
 * This was a server component so it could read the OAuth error from the query
 * string. With Google removed there is nothing to read, but it stays a server
 * component: the form must be in the server HTML rather than appearing after
 * hydration, which is what broke the last time this page was restructured.
 */
export default function LoginPage() {
  return <LoginForm />;
}
