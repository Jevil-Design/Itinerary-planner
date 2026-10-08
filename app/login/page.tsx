import LoginForm from './login-form';

/**
 * The query string is read here, on the server, so the form itself can be
 * rendered into the HTML. Reading it in the client component instead pushed the
 * whole page behind a Suspense boundary and shipped /login with no fields in it.
 *
 * A signed-in visitor never gets here: middleware sends them to the dashboard.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; notice?: string; error?: string }>;
}) {
  const sp = await searchParams;
  // Clamped to a same-site path: an absolute value would make the sign-in
  // redirect an open redirect.
  const raw = sp.next ?? '/dashboard';
  const next = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/dashboard';

  return <LoginForm next={next} notice={sp.notice ?? ''} initialError={sp.error ?? ''} />;
}
