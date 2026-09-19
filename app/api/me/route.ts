import { currentUser } from '@/lib/auth';
import { ok, fail } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await currentUser();
  if (!user) return fail('AUTH_FAILED', 'Not signed in.');
  return ok({ user });
}
