import type { TravelMode } from '../providers/types.ts';

/**
 * The stop engine.
 *
 * Given how long the road actually takes, this works out where the traveller
 * will be when they get hungry, tired, or run out of daylight — which is the
 * difference between "Kolkata to Darjeeling, then sightseeing" and a journey
 * someone can follow.
 *
 * Deliberately pure: no network, no clock, no randomness. Every output follows
 * from the arguments, so the schedule can be tested exactly, and the same trip
 * planned twice gives the same answer. Fetching real restaurants for the stops
 * it produces happens elsewhere, in lib/plan/itinerary.ts.
 *
 * Everything here is an estimate and is labelled as one. The distance and the
 * driving duration come from the routing provider and stay verified; how long a
 * person spends over lunch does not.
 */

export type StopKind =
  | 'depart' | 'rest' | 'fuel' | 'breakfast' | 'lunch' | 'tea' | 'dinner'
  | 'overnight' | 'arrive';

export type MealWindow = { from: string; to: string };

export type Preferences = {
  /** Local clock, "HH:MM". */
  departAt: string;
  /** Minutes of driving between short rests. */
  restEveryMin: number;
  restDurationMin: number;
  /** Cap on driving in one day, minutes. Beyond it the engine stops overnight. */
  maxDailyDriveMin: number;
  breakfast: MealWindow;
  lunch: MealWindow;
  tea: MealWindow;
  dinner: MealWindow;
  breakfastMin: number;
  lunchMin: number;
  teaMin: number;
  dinnerMin: number;
  /** Refuse to be on the road after this hour. Motorcycles especially. */
  lastDrivingHour: number;
  /** Kilometres between fuel stops; 0 disables. */
  fuelRangeKm: number;
};

/**
 * Defaults per travel mode.
 *
 * A motorcycle is not a slower car: the rider tires faster, the tank is
 * smaller, and riding a hill road after dark is the thing most likely to go
 * wrong on this particular route. Those are the numbers that differ.
 */
export function defaultsFor(mode: TravelMode): Preferences {
  const base: Preferences = {
    departAt: '06:00',
    restEveryMin: 150,
    restDurationMin: 20,
    maxDailyDriveMin: 9 * 60,
    breakfast: { from: '07:00', to: '10:00' },
    lunch: { from: '12:00', to: '14:30' },
    tea: { from: '16:00', to: '18:00' },
    dinner: { from: '19:00', to: '21:30' },
    breakfastMin: 40,
    lunchMin: 60,
    teaMin: 20,
    dinnerMin: 60,
    lastDrivingHour: 20,
    fuelRangeKm: 400,
  };
  if (mode === 'motorcycle') {
    return {
      ...base,
      restEveryMin: 120,      // rider fatigue arrives sooner than driver fatigue
      restDurationMin: 25,
      maxDailyDriveMin: 7 * 60,
      lastDrivingHour: 18,    // hill roads after dark are the main risk on this trip
      fuelRangeKm: 200,       // a tank, with a margin for stations that are shut
    };
  }
  if (mode === 'bus') return { ...base, restEveryMin: 180, maxDailyDriveMin: 11 * 60, fuelRangeKm: 0 };
  return base;
}

export type PlannedStop = {
  kind: StopKind;
  /** 0..1 along the route, so a real place can be searched for at this point. */
  routeFraction: number;
  /** Minutes from departure, wall clock including every earlier stop. */
  arriveOffsetMin: number;
  durationMin: number;
  /** 1-based. */
  day: number;
  /** "HH:MM" local. */
  arriveClock: string;
  departClock: string;
  /** Kilometres of route covered when this stop is reached. */
  distanceKm: number;
  /** Why the engine put a stop here — shown to the user as the estimate's basis. */
  reason: string;
};

export type Schedule = {
  stops: PlannedStop[];
  days: number;
  totalDrivingMin: number;
  totalElapsedMin: number;
};

const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

const clock = (minutesFromMidnight: number): string => {
  const m = ((minutesFromMidnight % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/**
 * Walks the journey a minute at a time, inserting stops as their triggers fire.
 *
 * A minute-resolution simulation rather than closed-form arithmetic because the
 * triggers interact: a lunch stop pushes the next rest later, an overnight stop
 * resets both, and the fuel counter runs on distance while the others run on
 * time. Section 9 requires that inserting a stop recalculates everything after
 * it, which falls out of simulating forward instead of computing offsets.
 *
 * @param drivingMinutes moving time from the routing provider
 * @param distanceKm     road distance from the routing provider
 */
export function buildSchedule(
  drivingMinutes: number,
  distanceKm: number,
  prefs: Preferences,
): Schedule {
  const stops: PlannedStop[] = [];
  const departMin = toMinutes(prefs.departAt);

  let driven = 0;              // minutes of driving done
  let elapsed = 0;             // minutes since departure, stops included
  let day = 1;
  let sinceRest = 0;
  let drivenToday = 0;
  let kmSinceFuel = 0;
  const mealsTaken = new Set<string>();  // "1:lunch"

  const kmAt = (drivenMin: number) =>
    drivingMinutes === 0 ? 0 : (drivenMin / drivingMinutes) * distanceKm;

  const push = (kind: StopKind, durationMin: number, reason: string) => {
    const nowClock = departMin + elapsed;
    stops.push({
      kind,
      // Clamped: the final minute of simulation can overshoot by a rounding hair,
      // and a fraction above 1 would index past the end of the route geometry.
      routeFraction: drivingMinutes === 0 ? 0 : Math.min(1, driven / drivingMinutes),
      arriveOffsetMin: Math.round(elapsed),
      durationMin,
      day,
      arriveClock: clock(nowClock),
      departClock: clock(nowClock + durationMin),
      distanceKm: Math.round(kmAt(driven) * 10) / 10,
      reason,
    });
    elapsed += durationMin;
  };

  push('depart', 0, 'Journey start');

  const mealDue = (name: 'breakfast' | 'lunch' | 'tea' | 'dinner'): boolean => {
    if (mealsTaken.has(`${day}:${name}`)) return false;
    const w = prefs[name];
    const nowOfDay = (departMin + elapsed) % 1440;
    return nowOfDay >= toMinutes(w.from) && nowOfDay <= toMinutes(w.to);
  };

  const takeMeal = (name: 'breakfast' | 'lunch' | 'tea' | 'dinner', minutes: number) => {
    mealsTaken.add(`${day}:${name}`);
    push(name, minutes, `${name[0].toUpperCase()}${name.slice(1)} window ${prefs[name].from}–${prefs[name].to}`);
    sinceRest = 0;   // a meal is also a rest
  };

  // Guard against a pathological input producing an unbounded loop.
  const limit = 14 * 24 * 60;

  while (driven < drivingMinutes && elapsed < limit) {
    const hourOfDay = Math.floor(((departMin + elapsed) % 1440) / 60);

    // --- must we stop for the night? -------------------------------------
    const tooLate = hourOfDay >= prefs.lastDrivingHour;
    const drivenEnough = drivenToday >= prefs.maxDailyDriveMin;
    if ((tooLate || drivenEnough) && driven < drivingMinutes) {
      const reason = drivenEnough
        ? `${Math.round(prefs.maxDailyDriveMin / 60)}h of driving reached for the day`
        : `Not driving after ${String(prefs.lastDrivingHour).padStart(2, '0')}:00`;

      // Check in first. The stop lasts until the next morning's departure, and
      // saying so is the difference between a night's rest and a blank gap.
      const checkInOfDay = (departMin + elapsed) % 1440;
      const untilMorning = ((departMin - checkInOfDay) + 1440) % 1440 || 1440;
      push('overnight', untilMorning, reason);

      // Dinner happens at the overnight stop, at dinner time — not at whatever
      // hour the riding stopped. Arriving at 15:35 does not mean eating then.
      if (!mealsTaken.has(`${day}:dinner`)) {
        const dinnerStart = toMinutes(prefs.dinner.from);
        const waitForDinner = ((dinnerStart - checkInOfDay) + 1440) % 1440;
        // Only if dinner falls before the next departure, i.e. this same evening.
        if (waitForDinner < untilMorning) {
          const saved = elapsed;
          elapsed = saved - untilMorning + waitForDinner;
          takeMeal('dinner', prefs.dinnerMin);
          elapsed = saved;   // the night continues regardless of when dinner was
        }
      }

      day += 1;
      drivenToday = 0;
      sinceRest = 0;
      continue;
    }

    // --- meals ------------------------------------------------------------
    if (mealDue('breakfast')) { takeMeal('breakfast', prefs.breakfastMin); continue; }
    if (mealDue('lunch')) { takeMeal('lunch', prefs.lunchMin); continue; }
    if (mealDue('tea')) { takeMeal('tea', prefs.teaMin); continue; }
    if (mealDue('dinner')) { takeMeal('dinner', prefs.dinnerMin); continue; }

    // --- fuel, on distance rather than time -------------------------------
    if (prefs.fuelRangeKm > 0 && kmSinceFuel >= prefs.fuelRangeKm) {
      push('fuel', 15, `Roughly every ${prefs.fuelRangeKm} km`);
      kmSinceFuel = 0;
      sinceRest = 0;
      continue;
    }

    // --- short rest -------------------------------------------------------
    if (sinceRest >= prefs.restEveryMin) {
      push('rest', prefs.restDurationMin, `After ${Math.round(prefs.restEveryMin / 60 * 10) / 10}h of driving`);
      sinceRest = 0;
      continue;
    }

    // --- drive a minute ---------------------------------------------------
    const kmBefore = kmAt(driven);
    driven += 1;
    elapsed += 1;
    sinceRest += 1;
    drivenToday += 1;
    kmSinceFuel += kmAt(driven) - kmBefore;
  }

  push('arrive', 0, 'Destination reached');

  return {
    stops,
    days: day,
    totalDrivingMin: Math.round(drivingMinutes),
    totalElapsedMin: Math.round(elapsed),
  };
}
