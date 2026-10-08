import SignupForm from './signup-form';

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const sp = await searchParams;
  const raw = sp.next ?? '/dashboard';
  const next = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/dashboard';
  return <SignupForm next={next} />;
}
