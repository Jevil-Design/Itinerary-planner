import { currentUser } from '@/lib/auth';
import { listTrips, createTrip } from '@/lib/queries/trips';
import { createTripSchema, fieldErrors } from '@/lib/validation';
import { ok, fail } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await currentUser();
  if (!user) return fail('AUTH_FAILED', 'Sign in to see your trips.');
  return ok({ trips: await listTrips(user.id) });
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return fail('AUTH_FAILED', 'Sign in to create a trip.');

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('VALIDATION_FAILED', 'Expected a JSON body.');
  }

  const parsed = createTripSchema.safeParse(body);
  if (!parsed.success) {
    return fail('VALIDATION_FAILED', 'Check the highlighted fields.', fieldErrors(parsed.error));
  }

  try {
    return ok({ trip: await createTrip(user.id, parsed.data) }, 201);
  } catch (e) {
    console.error('[POST /api/trips]', e);
    return fail('SAVE_FAILED', 'The trip could not be saved. Nothing was written.');
  }
}
