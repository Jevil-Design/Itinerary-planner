import { currentUser } from '@/lib/auth';
import { getTrip, deleteTrip } from '@/lib/queries/trips';
import { ok, fail } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return fail('AUTH_FAILED', 'Sign in to see this trip.');
  const { id } = await params;
  const trip = await getTrip(user.id, id);
  // Someone else's trip is indistinguishable from one that does not exist.
  if (!trip) return fail('NOT_FOUND', 'That trip does not exist.');
  return ok({ trip });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return fail('AUTH_FAILED', 'Sign in to delete this trip.');
  const { id } = await params;
  const removed = await deleteTrip(user.id, id);
  if (!removed) return fail('NOT_FOUND', 'That trip does not exist.');
  return ok({ deleted: id });
}
