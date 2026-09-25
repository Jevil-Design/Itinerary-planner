import LoginForm from './login-form';

const OAUTH_ERRORS: Record<string, string> = {
  google_unconfigured: 'Google sign-in is not set up on this deployment yet.',
  google_denied: 'Google sign-in was cancelled.',
  google_no_code: 'Google did not return an authorization code. Try again.',
  google_exchange_failed: 'Could not complete Google sign-in. Try again.',
  google_state_missing: 'That sign-in attempt expired. Start again.',
  google_state_expired: 'That sign-in attempt expired. Start again.',
  google_state_mismatch: 'That sign-in link did not match this browser. Start again.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return <LoginForm oauthError={OAUTH_ERRORS[error ?? ''] ?? ''} />;
}
