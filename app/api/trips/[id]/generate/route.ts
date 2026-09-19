import { currentUser } from '@/lib/auth';
import { getTrip } from '@/lib/queries/trips';
import { replacePlan, planCounts } from '@/lib/queries/plan';
import { buildPlan } from '@/lib/itinerary/plan';
import { providerStatus, degradationNotices } from '@/lib/services/providers';
import { ok, fail } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/trips/:id/generate
 *
 * Writes the deterministic plan — days, route, packing, checklist, budget
 * categories — in one transaction. Activities, stays, food, sightseeing and
 * measured distances come from the AI, places, routing and weather providers,
 * and are simply absent until those are configured. The response says which
 * were missing so the UI can tell the user rather than quietly showing less.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return fail('AUTH_FAILED', 'Sign in to generate a trip.');

  const { id } = await params;
  const trip = await getTrip(user.id, id);
  if (!trip) return fail('NOT_FOUND', 'That trip does not exist.');

  const ai = providerStatus('ai');

  try {
    await replacePlan(user.id, trip.id, buildPlan(trip));
  } catch (e) {
    console.error('[POST /api/trips/:id/generate]', e);
    // The write is one transaction, so a failure leaves the trip as it was.
    return fail('SAVE_FAILED', 'Generation failed and nothing was written. Try again.');
  }

  return ok({
    trip_id: trip.id,
    counts: await planCounts(user.id, trip.id),
    // Honest about what is missing rather than presenting a thin plan as complete.
    complete: ai.configured,
    notices: degradationNotices(),
  });
}
