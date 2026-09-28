import { NextResponse } from 'next/server';
import { z } from 'zod';
import { currentSession } from '@/lib/session';
import { planTrip } from '@/lib/plan/itinerary';

/**
 * Plan a trip from real provider data.
 *
 * Runs on the server for two reasons: the places key must never reach a
 * browser, and the stop engine needs the full route geometry, which is far too
 * large to ship to the client and back.
 *
 * Nothing is written anywhere. The itinerary is computed, returned, and
 * forgotten — the same storage posture as the rest of the app.
 */

export const dynamic = 'force-dynamic';
/** Providers are slow; OSRM alone can take several seconds. */
export const maxDuration = 60;

const Body = z.object({
  from: z.string().min(2).max(120),
  to: z.string().min(2).max(120),
  mode: z.enum(['car', 'motorcycle', 'bus', 'train', 'flight']),
  departAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  travellers: z.number().int().min(1).max(20).optional(),
  currency: z.enum(['INR', 'USD', 'EUR', 'GBP']).optional(),
  prefs: z
    .object({
      restEveryMin: z.number().int().min(30).max(480).optional(),
      restDurationMin: z.number().int().min(5).max(120).optional(),
      maxDailyDriveMin: z.number().int().min(60).max(16 * 60).optional(),
      lastDrivingHour: z.number().int().min(12).max(24).optional(),
      fuelRangeKm: z.number().int().min(0).max(1200).optional(),
      breakfastMin: z.number().int().min(0).max(180).optional(),
      lunchMin: z.number().int().min(0).max(180).optional(),
      teaMin: z.number().int().min(0).max(180).optional(),
      dinnerMin: z.number().int().min(0).max(180).optional(),
    })
    .optional(),
});

const fail = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message } }, { status });

export async function POST(req: Request) {
  // Planning costs several provider calls, so it is gated like the planner.
  const session = await currentSession();
  if (!session) return fail('UNAUTHENTICATED', 'Sign in to plan a trip.', 401);

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return fail('BAD_REQUEST', 'Expected a JSON body.', 400);
  }

  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return fail('BAD_REQUEST', `${first.path.join('.') || 'body'}: ${first.message}`, 400);
  }

  const { from, to, mode } = parsed.data;
  if (mode === 'train' || mode === 'flight') {
    return fail(
      'MODE_UNSUPPORTED',
      `No timetable provider is wired, so ${mode} journeys cannot be planned yet. ` +
        `Road modes (car, motorcycle, bus) use live routing.`,
      501,
    );
  }

  const result = await planTrip({ ...parsed.data, from, to, deadlineMs: 50_000 });
  if (!result.ok) return fail('PLAN_FAILED', result.error, 502);

  return NextResponse.json(result.data, {
    // A trip is personal and nothing about it should be cached by an intermediary.
    headers: { 'cache-control': 'no-store, private' },
  });
}
