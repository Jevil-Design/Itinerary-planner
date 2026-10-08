/**
 * The vehicle and fuel engine, offline.
 *
 * Driven by the brief's own example: a Hero Xpulse 210 from Kolkata to Sikkim.
 * No provider is called, so every assertion holds regardless of the network.
 *
 *   node --experimental-strip-types scripts/verify-fuel.mjs
 */
import { matchVehicle, VEHICLES } from '../lib/vehicles/catalogue.ts';
import { estimateFuel, terrainFor, ASSUMED_PETROL_PRICE } from '../lib/vehicles/fuel.ts';

let pass = 0, fail = 0;
const ok = (label, cond, note = '') => {
  if (cond) { pass++; console.log(`  ok    ${label}${note ? '  [' + note + ']' : ''}`); }
  else { fail++; console.log(`  FAIL  ${label}${note ? '  [' + note + ']' : ''}`); }
};

console.log('\nVEHICLE & FUEL');
console.log('='.repeat(64));

/* ---------- identifying the vehicle ---------- */
const xpulse = matchVehicle('Hero Xpulse 210');
ok('an exact model is found', xpulse.vehicle.id === 'hero-xpulse-210', xpulse.vehicle.name);
ok('it is marked as a catalogue figure', xpulse.confidence === 'catalogue');
ok('a partial name still matches', matchVehicle('xpulse').vehicle.id.startsWith('hero-xpulse'));
ok('case and punctuation do not matter', matchVehicle('ROYAL-ENFIELD himalayan 450').vehicle.id === 're-himalayan-450');

const unknown = matchVehicle('Jawa Perak 334');
ok('an unknown bike is not given a precise figure it has not earned', unknown.confidence !== 'catalogue', unknown.confidence);
ok('an unknown bike is still classed as a motorcycle', unknown.vehicle.vehicleClass.startsWith('motorcycle'), unknown.vehicle.vehicleClass);
ok('the fallback says it is a class average', /typical|catalogue/i.test(unknown.note));
ok('a diesel hint is picked up', matchVehicle('some diesel SUV').vehicle.fuel === 'diesel');

/* the classifier must not now read every car as a bike */
for (const [input, expected] of [
  ['Jawa Perak 334', 'motorcycle'],
  ['Yezdi Adventure', 'motorcycle'],
  ['Bajaj Pulsar 150', 'motorcycle'],
  ['Triumph Speed 400', 'motorcycle'],
  ['Maruti Swift', 'car'],
  ['Hyundai i20', 'car'],
  ['Toyota Innova Crysta', 'car'],
  ['Tata Harrier', 'car'],
  ['Honda Activa 125', 'scooter'],
]) {
  const got = matchVehicle(input).vehicle.vehicleClass;
  ok('classified: ' + input, got.startsWith(expected), got);
}
ok('an empty input does not throw', matchVehicle('').confidence === 'default');

/* ---------- mileage: whose figure wins ---------- */
const base = estimateFuel({ vehicleInput: 'Hero Xpulse 210' }, [{ label: 'x', distanceKm: 100, terrain: 'mixed' }]);
ok('the catalogue figure is used when the user gives none', base.baseKmpl.value === 35, String(base.baseKmpl.value));
ok("the basis says it is not the manufacturer's claim", /not the manufacturer/i.test(base.mileageBasis));

const overridden = estimateFuel(
  { vehicleInput: 'Hero Xpulse 210', userKmpl: 42 },
  [{ label: 'x', distanceKm: 100, terrain: 'mixed' }],
);
ok("THE USER'S OWN MILEAGE OVERRIDES THE CATALOGUE", overridden.baseKmpl.value === 42, String(overridden.baseKmpl.value));
ok('and the basis says so', /as you entered/i.test(overridden.mileageBasis));
ok('a higher mileage costs less fuel', overridden.totalLitres.value < base.totalLitres.value);

/* ---------- everything is an estimate, never verified ---------- */
for (const [label, s] of [['base mileage', base.baseKmpl], ['fuel price', base.pricePerLitre], ['total litres', base.totalLitres], ['total cost', base.totalCost]]) {
  ok(`${label} is typed as an estimate, never verified`, s.provenance.kind === 'estimate');
  ok(`${label} states its basis`, Boolean(s.provenance.basis?.length));
}

/* ---------- terrain ---------- */
ok('a hill destination is recognised as mountain', terrainFor(600, 'Gangtok, Sikkim') === 'mountain');
ok('a long run is treated as highway', terrainFor(500, 'Nagpur') === 'highway');
ok('a short hop is treated as city', terrainFor(20, 'Howrah') === 'city');

const hill = estimateFuel({ vehicleInput: 'Hero Xpulse 210' }, [{ label: 'climb', distanceKm: 100, terrain: 'mountain' }]);
const road = estimateFuel({ vehicleInput: 'Hero Xpulse 210' }, [{ label: 'plain', distanceKm: 100, terrain: 'highway' }]);
ok('MOUNTAIN COSTS MORE FUEL THAN HIGHWAY over the same distance',
  hill.totalLitres.value > road.totalLitres.value,
  `${hill.totalLitres.value} L vs ${road.totalLitres.value} L`);
ok('and the segment explains why', /climbing/i.test(hill.segments[0].basis));

/* ---------- load ---------- */
const solo = estimateFuel({ vehicleInput: 'Hero Xpulse 210', travellers: 1 }, [{ label: 'x', distanceKm: 500, terrain: 'mixed' }]);
const two = estimateFuel({ vehicleInput: 'Hero Xpulse 210', travellers: 2, luggage: true }, [{ label: 'x', distanceKm: 500, terrain: 'mixed' }]);
ok('two up with luggage uses more fuel than solo', two.totalLitres.value > solo.totalLitres.value,
  `${two.totalLitres.value} L vs ${solo.totalLitres.value} L`);
ok('and the reduction is stated', two.notes.some((n) => /reduced by/i.test(n)));

/* ---------- the brief's trip, route-wise ---------- */
const trip = estimateFuel(
  { vehicleInput: 'Hero Xpulse 210', travellers: 2, luggage: true },
  [
    { label: 'Kolkata → Siliguri', distanceKm: 560, terrain: 'highway' },
    { label: 'Siliguri → Gangtok', distanceKm: 120, terrain: 'mountain' },
    { label: 'Gangtok → Lachen',   distanceKm: 130, terrain: 'mountain' },
    { label: 'Return to Kolkata',  distanceKm: 690, terrain: 'highway' },
  ],
  6,
);
ok('every leg is costed separately', trip.segments.length === 4);
ok('the distances add up', trip.totalDistanceKm === 1500, String(trip.totalDistanceKm));
ok('the total is the sum of the legs',
  trip.totalCost.value === trip.segments.reduce((t, s) => t + s.cost, 0), `₹${trip.totalCost.value}`);
ok('cost per day is reported', trip.costPerDay !== null && trip.costPerDay > 0, `₹${trip.costPerDay}/day`);
ok('cost per person halves for two', trip.costPerPerson === Math.round(trip.totalCost.value / 2));
ok('the mountain legs return fewer km/l than the highway legs',
  trip.segments[1].effectiveKmpl < trip.segments[0].effectiveKmpl,
  `${trip.segments[1].effectiveKmpl} vs ${trip.segments[0].effectiveKmpl}`);
ok('refuelling stops are worked out', trip.refuelsNeeded >= 3, `${trip.refuelsNeeded} refills, ~${trip.rangePerTankKm} km a tank`);
ok('the figure is plausible for a 1500 km bike trip',
  trip.totalLitres.value > 40 && trip.totalLitres.value < 60, `${trip.totalLitres.value} L`);

/* ---------- fuel price honesty ---------- */
ok('an unstated price is flagged as an assumption', trip.priceSource === 'estimate');
ok('and the note says no live feed is connected', trip.notes.some((n) => /no live price feed/i.test(n)));
ok('the assumed price is the stated constant', trip.pricePerLitre.value === ASSUMED_PETROL_PRICE);

const priced = estimateFuel(
  { vehicleInput: 'Hero Xpulse 210', fuelPricePerLitre: 98 },
  [{ label: 'x', distanceKm: 100, terrain: 'mixed' }],
);
ok("A USER'S OWN FUEL PRICE IS USED", priced.pricePerLitre.value === 98);
ok('and is not labelled an assumption', priced.priceSource === 'user');
ok('no stale-price warning is shown when the user supplied one',
  !priced.notes.some((n) => /no live price feed/i.test(n)));

/* ---------- a diesel car ---------- */
const car = estimateFuel({ vehicleInput: 'Toyota Innova Crysta', travellers: 4 },
  [{ label: 'x', distanceKm: 1000, terrain: 'highway' }]);
ok('a diesel vehicle is priced as diesel', car.pricePerLitre.value < ASSUMED_PETROL_PRICE, `₹${car.pricePerLitre.value}`);
ok('a car uses far more fuel than a bike over the same road',
  car.totalLitres.value > trip.segments[0].litres * 1.5);

/* ---------- degenerate input ---------- */
const empty = estimateFuel({ vehicleInput: 'Hero Xpulse 210' }, []);
ok('no segments gives a zero total rather than NaN', empty.totalLitres.value === 0 && empty.totalCost.value === 0);
ok('and does not divide by zero', Number.isFinite(empty.costPerPerson));
ok('every catalogue entry has a sane mileage',
  VEHICLES.every((v) => v.realWorldKmpl > 5 && v.realWorldKmpl < 100));
ok('every catalogue entry has a tank size', VEHICLES.every((v) => v.tankLitres > 0));

console.log('-'.repeat(64));
console.log(`${pass}/${pass + fail} passed${fail ? ', ' + fail + ' FAILED' : ', all green'}`);
process.exit(fail ? 1 : 0);
