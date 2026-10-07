import LoginForm from './login-form';

/**
 * A server component so the form is in the server HTML rather than appearing
 * after hydration, and so an error carried back from /auth/callback is rendered
 * on the first paint.
 *
 * A signed-in visitor never reaches here: middleware redirects them to the
 * dashboard before this runs.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return <LoginForm initialError={error ?? ''} />;
}
