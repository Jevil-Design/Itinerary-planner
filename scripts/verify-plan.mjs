/**
 * The planning engine, offline. No provider is called, so these assertions hold
 * whether or not Overpass is having a good day.
 *
 *   node --experimental-strip-types scripts/verify-plan.mjs
 */
import { buildSchedule, defaultsFor } from '../lib/plan/engine.ts';
import { estimateBudget } from '../lib/plan/budget.ts';
import { pointAtFraction, haversine } from '../lib/providers/routing.ts';
import { opensBy } from '../lib/providers/places.ts';
import { verified, estimated, unavailable } from '../lib/providers/types.ts';
import { describeCode, isWashout } from '../lib/providers/weather.ts';

let pass = 0, fail = 0;
const ok = (label, cond, note = '') => {
  if (cond) { pass++; console.log(`  ok    ${label}${note ? '  [' + note + ']' : ''}`); }
  else { fail++; console.log(`  FAIL  ${label}${note ? '  [' + note + ']' : ''}`); }
};

console.log('\nPLANNING ENGINE');
console.log('='.repeat(60));

/* ---------- provenance: the rule sections 2 and 31 turn on ---------- */
ok('verified carries its source', verified(5, 'OSRM').provenance.source === 'OSRM');
ok('verified is stamped with a time', Boolean(verified(5, 'OSRM').provenance.fetchedAt));
ok('an estimate is never marked verified', estimated(5, 'x').provenance.kind === 'estimate');
ok('unavailable names the provider', unavailable(0, 'Overpass', 'timed out').provenance.provider === 'Overpass');
ok('unavailable keeps a safe fallback value', unavailable(0, 'p', 'r').value === 0);

/* ---------- the real route, Kolkata to Darjeeling ---------- */
const KM = 636.6, DRIVE = 8.26 * 60;
const moto = { ...defaultsFor('motorcycle'), departAt: '05:00' };
const s = buildSchedule(DRIVE, KM, moto);

ok('an 8.3h ride is split across days', s.days === 2, `${s.days} days`);
ok('the schedule starts with departure', s.stops[0].kind === 'depart');
ok('the schedule ends with arrival', s.stops.at(-1).kind === 'arrive');
ok('driving time is unchanged by stops', Math.round(s.totalDrivingMin) === Math.round(DRIVE));
ok('elapsed time exceeds driving time', s.totalElapsedMin > s.totalDrivingMin);

const at = (k) => s.stops.filter((x) => x.kind === k);
ok('breakfast is scheduled', at('breakfast').length >= 1);
ok('lunch is scheduled', at('lunch').length >= 1);
ok('an overnight stop is scheduled', at('overnight').length === 1);

const bf = at('breakfast')[0];
ok('breakfast falls inside its window', bf.arriveClock >= '07:00' && bf.arriveClock <= '10:00', bf.arriveClock);
const ln = at('lunch')[0];
ok('lunch falls inside its window', ln.arriveClock >= '12:00' && ln.arriveClock <= '14:30', ln.arriveClock);

/*
 * The bug this caught: dinner was taken at 14:35 because the overnight trigger
 * forced it, while still labelled the 19:00 window.
 */
const dn = at('dinner')[0];
ok('dinner falls inside its window', !dn || (dn.arriveClock >= '19:00' && dn.arriveClock <= '21:30'), dn && dn.arriveClock);

const night = at('overnight')[0];
ok('the night has real duration', night.durationMin > 0, `${night.durationMin} min`);
ok('the night ends at the departure time', night.departClock === '05:00', night.departClock);

/* ---------- a schedule must move forwards ---------- */
let monotonic = true, lastOffset = -1, lastFraction = -0.001;
for (const x of s.stops) {
  if (x.arriveOffsetMin < lastOffset) monotonic = false;
  if (x.routeFraction < lastFraction - 1e-9) monotonic = false;
  lastOffset = x.arriveOffsetMin; lastFraction = x.routeFraction;
}
ok('time and distance both only move forwards', monotonic);
ok('no stop sits beyond the end of the route', s.stops.every((x) => x.routeFraction <= 1));
ok('every stop names its reason', s.stops.every((x) => x.reason.length > 0));

/* ---------- mode-specific behaviour, section 21 ---------- */
const car = buildSchedule(DRIVE, KM, { ...defaultsFor('car'), departAt: '05:00' });
ok('a car may drive longer per day than a motorcycle',
  defaultsFor('car').maxDailyDriveMin > defaultsFor('motorcycle').maxDailyDriveMin);
ok('a motorcycle rests more often',
  defaultsFor('motorcycle').restEveryMin < defaultsFor('car').restEveryMin);
ok('a motorcycle stops riding earlier in the evening',
  defaultsFor('motorcycle').lastDrivingHour < defaultsFor('car').lastDrivingHour);
ok('a motorcycle refuels more often',
  defaultsFor('motorcycle').fuelRangeKm < defaultsFor('car').fuelRangeKm);
ok('the same road takes a car no more days', car.days <= s.days, `car ${car.days} vs moto ${s.days}`);

/* ---------- short trips must not invent an overnight ---------- */
const hop = buildSchedule(90, 60, { ...defaultsFor('car'), departAt: '09:00' });
ok('a 90 minute drive stays a single day', hop.days === 1);
ok('a 90 minute drive gets no overnight stop', !hop.stops.some((x) => x.kind === 'overnight'));
ok('a 90 minute drive gets no rest stop', !hop.stops.some((x) => x.kind === 'rest'));

/* ---------- degenerate inputs must not hang or throw ---------- */
const zero = buildSchedule(0, 0, defaultsFor('car'));
ok('a zero-length trip terminates', zero.stops.length >= 2);
ok('a zero-length trip reports one day', zero.days === 1);

/* ---------- geometry ---------- */
const line = [{ lat: 0, lon: 0 }, { lat: 0, lon: 1 }, { lat: 0, lon: 2 }];
ok('fraction 0 is the start', pointAtFraction(line, 0).lon === 0);
ok('fraction 1 is the end', pointAtFraction(line, 1).lon === 2);
ok('fraction 0.5 is the middle', Math.abs(pointAtFraction(line, 0.5).lon - 1) < 0.01);
ok('a fraction past the end is clamped', pointAtFraction(line, 9).lon === 2);
ok('a negative fraction is clamped', pointAtFraction(line, -3).lon === 0);
const straightLine = haversine({ lat: 22.5726, lon: 88.3639 }, { lat: 27.041, lon: 88.2636 });
ok('haversine is sane over 500 km', straightLine > 490_000 && straightLine < 510_000,
  `${(straightLine / 1000).toFixed(0)} km straight line`);

/* ---------- opening hours: never claim open without evidence ---------- */
ok('missing hours means unknown, not open', opensBy(undefined, '07:45') === null);
ok('unparseable hours mean unknown', opensBy('by appointment', '07:45') === null);
ok('24/7 is open', opensBy('24/7', '03:00') === true);
ok('before opening is shut', opensBy('Mo-Su 09:00-22:00', '07:45') === false);
ok('inside hours is open', opensBy('Mo-Su 09:00-22:00', '12:30') === true);
ok('after closing is shut', opensBy('Mo-Su 09:00-22:00', '23:30') === false);
ok('a range over midnight is handled', opensBy('Mo-Su 18:00-02:00', '01:00') === true);

/* ---------- weather ---------- */
ok('a known code is described', describeCode(95) === 'Thunderstorm');
ok('an unknown code is not invented', describeCode(4242) === 'Unknown');
ok('98% rain is a washout', isWashout({ rainChance: 98, code: 51 }));
ok('a clear day is not', !isWashout({ rainChance: 5, code: 0 }));

/* ---------- budget: everything is an estimate ---------- */
const b = estimateBudget({ distanceKm: KM, mode: 'motorcycle', nights: 1, travellers: 2,
  stops: s.stops.map((x) => x.kind), currency: 'INR' });
ok('the budget has lines', b.lines.length > 3);
ok('every budget line is an estimate, never verified',
  b.lines.every((l) => l.amount.provenance.kind === 'estimate'));
ok('every budget line shows its arithmetic', b.lines.every((l) => l.workings.length > 0));
ok('the total is the sum of the lines',
  b.total === b.lines.reduce((t, l) => t + l.amount.value, 0), `${b.total}`);
ok('per person divides by travellers', b.perPerson === Math.round(b.total / 2));
ok('a buffer is included', b.lines.some((l) => /buffer/i.test(l.label)));
const bikeFuel = b.lines.find((l) => l.label === 'Fuel').amount.value;
const carFuel = estimateBudget({ distanceKm: KM, mode: 'car', nights: 1, travellers: 2, stops: [], currency: 'INR' })
  .lines.find((l) => l.label === 'Fuel').amount.value;
ok('a car costs more in fuel than a motorcycle', carFuel > bikeFuel, `${carFuel} vs ${bikeFuel}`);

console.log('-'.repeat(60));
console.log(`${pass}/${pass + fail} passed${fail ? ', ' + fail + ' FAILED' : ', all green'}`);
process.exit(fail ? 1 : 0);
