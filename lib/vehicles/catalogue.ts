/**
 * Vehicles, and what they actually return on a road trip.
 *
 * Every figure here is a **planning estimate**, not a manufacturer claim. Those
 * two differ by a wide margin — a quoted figure comes from a standardised test
 * cycle, and a loaded bike on a hill road does not resemble one. Using the
 * marketing number would make every fuel budget optimistic in the same
 * direction, which is worse than being roughly right.
 *
 * So the numbers below are deliberately conservative, and the engine labels
 * them as estimates all the way to the screen. Where a user knows their own
 * mileage, theirs wins — see lib/vehicles/fuel.ts.
 *
 * Nothing here pretends to be live data. No provider publishes real-world
 * mileage, so none is claimed.
 */

export type FuelType = 'petrol' | 'diesel' | 'electric' | 'cng';

export type VehicleClass =
  | 'motorcycle-small'   // commuter, up to ~160cc
  | 'motorcycle-mid'     // 200–400cc, the usual touring bikes
  | 'motorcycle-large'   // 400cc and up
  | 'scooter'
  | 'car-hatchback'
  | 'car-sedan'
  | 'car-suv'
  | 'car-muv';

export type Vehicle = {
  id: string;
  name: string;
  vehicleClass: VehicleClass;
  fuel: FuelType;
  /** Conservative real-world km/l (or km/kWh for electric). A planning figure. */
  realWorldKmpl: number;
  /** Usable tank in litres, for working out refuelling range. */
  tankLitres: number;
};

/**
 * A small, honest catalogue rather than a large invented one.
 *
 * These are the vehicles the brief names plus a few common Indian touring
 * choices. Anything else falls back to its class, which is a better answer than
 * a precise-looking number for a vehicle nobody checked.
 */
export const VEHICLES: Vehicle[] = [
  { id: 'hero-xpulse-210',    name: 'Hero Xpulse 210',           vehicleClass: 'motorcycle-mid',   fuel: 'petrol', realWorldKmpl: 35, tankLitres: 13 },
  { id: 'hero-xpulse-200',    name: 'Hero Xpulse 200 4V',        vehicleClass: 'motorcycle-mid',   fuel: 'petrol', realWorldKmpl: 36, tankLitres: 13 },
  { id: 're-himalayan-450',   name: 'Royal Enfield Himalayan 450', vehicleClass: 'motorcycle-large', fuel: 'petrol', realWorldKmpl: 28, tankLitres: 17 },
  { id: 're-himalayan-411',   name: 'Royal Enfield Himalayan 411', vehicleClass: 'motorcycle-mid',   fuel: 'petrol', realWorldKmpl: 30, tankLitres: 15 },
  { id: 're-classic-350',     name: 'Royal Enfield Classic 350', vehicleClass: 'motorcycle-mid',   fuel: 'petrol', realWorldKmpl: 33, tankLitres: 13 },
  { id: 'bajaj-dominar-400',  name: 'Bajaj Dominar 400',         vehicleClass: 'motorcycle-large', fuel: 'petrol', realWorldKmpl: 28, tankLitres: 13 },
  { id: 'ktm-390-adventure',  name: 'KTM 390 Adventure',         vehicleClass: 'motorcycle-mid',   fuel: 'petrol', realWorldKmpl: 28, tankLitres: 14.5 },
  { id: 'honda-activa-125',   name: 'Honda Activa 125',          vehicleClass: 'scooter',          fuel: 'petrol', realWorldKmpl: 45, tankLitres: 5.3 },
  { id: 'honda-shine-125',    name: 'Honda Shine 125',           vehicleClass: 'motorcycle-small', fuel: 'petrol', realWorldKmpl: 55, tankLitres: 10.5 },
  { id: 'hero-splendor-plus', name: 'Hero Splendor Plus',        vehicleClass: 'motorcycle-small', fuel: 'petrol', realWorldKmpl: 60, tankLitres: 9.8 },
  { id: 'toyota-innova-crysta', name: 'Toyota Innova Crysta',    vehicleClass: 'car-muv',          fuel: 'diesel', realWorldKmpl: 12, tankLitres: 55 },
  { id: 'hyundai-creta',      name: 'Hyundai Creta',             vehicleClass: 'car-suv',          fuel: 'petrol', realWorldKmpl: 13, tankLitres: 50 },
  { id: 'maruti-brezza',      name: 'Maruti Suzuki Brezza',      vehicleClass: 'car-suv',          fuel: 'petrol', realWorldKmpl: 14, tankLitres: 48 },
  { id: 'maruti-swift',       name: 'Maruti Suzuki Swift',       vehicleClass: 'car-hatchback',    fuel: 'petrol', realWorldKmpl: 18, tankLitres: 37 },
  { id: 'tata-nexon',         name: 'Tata Nexon',                vehicleClass: 'car-suv',          fuel: 'petrol', realWorldKmpl: 14, tankLitres: 44 },
  { id: 'mahindra-thar',      name: 'Mahindra Thar',             vehicleClass: 'car-suv',          fuel: 'diesel', realWorldKmpl: 12, tankLitres: 57 },
];

/** Used when a vehicle is not in the catalogue. Deliberately broad. */
const CLASS_DEFAULTS: Record<VehicleClass, { kmpl: number; tank: number }> = {
  'motorcycle-small': { kmpl: 55, tank: 10 },
  'motorcycle-mid':   { kmpl: 32, tank: 14 },
  'motorcycle-large': { kmpl: 26, tank: 16 },
  'scooter':          { kmpl: 45, tank: 6 },
  'car-hatchback':    { kmpl: 17, tank: 38 },
  'car-sedan':        { kmpl: 15, tank: 45 },
  'car-suv':          { kmpl: 13, tank: 48 },
  'car-muv':          { kmpl: 12, tank: 52 },
};

export type VehicleMatch = {
  vehicle: Vehicle;
  /** How the vehicle was identified, so the UI can be honest about it. */
  confidence: 'catalogue' | 'inferred' | 'default';
  note: string;
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Finds a vehicle from whatever the user typed.
 *
 * Three outcomes, and the difference matters: a catalogue hit carries a figure
 * someone chose for that machine; an inferred one carries its class average and
 * says so; a default is a guess of last resort. A UI that shows all three the
 * same way would be claiming more than it knows.
 */
export function matchVehicle(input: string): VehicleMatch {
  const q = norm(input);
  if (!q) {
    const d = CLASS_DEFAULTS['car-hatchback'];
    return {
      vehicle: { id: 'unknown', name: 'Unspecified vehicle', vehicleClass: 'car-hatchback', fuel: 'petrol', realWorldKmpl: d.kmpl, tankLitres: d.tank },
      confidence: 'default',
      note: 'No vehicle given — assuming a petrol hatchback.',
    };
  }

  // Exact, then substring either way, so "xpulse" finds "Hero Xpulse 210".
  const exact = VEHICLES.find((v) => norm(v.name) === q);
  if (exact) return { vehicle: exact, confidence: 'catalogue', note: 'Planning estimate for this model.' };

  const partial = VEHICLES.find((v) => norm(v.name).includes(q) || q.includes(norm(v.name)));
  if (partial) return { vehicle: partial, confidence: 'catalogue', note: `Matched to ${partial.name}.` };

  // Score by how many words of the catalogue name appear in the input.
  let best: { v: Vehicle; score: number } | null = null;
  for (const v of VEHICLES) {
    const words = norm(v.name).split(' ').filter((w) => w.length > 2);
    const score = words.filter((w) => q.includes(w)).length;
    if (score > 0 && (!best || score > best.score)) best = { v, score };
  }
  if (best && best.score >= 2) {
    return { vehicle: best.v, confidence: 'catalogue', note: `Matched to ${best.v.name}.` };
  }

  const guessed = guessClass(q);
  const d = CLASS_DEFAULTS[guessed];
  return {
    vehicle: {
      id: 'custom', name: input.trim(), vehicleClass: guessed,
      fuel: /diesel/.test(q) ? 'diesel' : /electric|\bev\b/.test(q) ? 'electric' : 'petrol',
      realWorldKmpl: d.kmpl, tankLitres: d.tank,
    },
    confidence: 'inferred',
    note: `Not in the catalogue — using a typical figure for a ${guessed.replace('-', ' ')}. Enter your own mileage for an accurate estimate.`,
  };
}

/** Model names that settle the question on their own, checked before anything else. */
const CAR_MODELS = /innova|ertiga|carens|xl6|marazzo|creta|nexon|brezza|thar|scorpio|fortuner|seltos|venue|punch|harrier|safari|verna|dzire|amaze|virtus|slavia|ciaz|swift|baleno|i20|altroz|tiago/;
const BIKE_BRANDS = /bike|motorcycle|bullet|royal enfield|\bre\b|ktm|pulsar|xpulse|himalayan|duke|jawa|yezdi|benelli|husqvarna|triumph|harley|apache|fz\b|gixxer|hunter|interceptor|continental gt|meteor|scrambler|adventure|dominar|avenger|classic/;

function guessClass(q: string): VehicleClass {
  if (/scooter|activa|access|jupiter|dio|ntorq|burgman|vespa/.test(q)) return 'scooter';

  // Car models first: a name like "Swift" must not be caught by a later rule.
  if (/innova|ertiga|carens|muv|xl6|marazzo/.test(q)) return 'car-muv';
  if (/suv|creta|nexon|brezza|thar|scorpio|fortuner|seltos|venue|punch|harrier|safari/.test(q)) return 'car-suv';
  if (/sedan|verna|dzire|amaze|virtus|slavia|ciaz/.test(q)) return 'car-sedan';

  // An explicit displacement.
  const cc = q.match(/\b(\d{2,4})\s?cc\b/);
  if (cc) return byDisplacement(Number(cc[1]));

  /*
   * A bare number in a vehicle name is almost always a motorcycle's
   * displacement — "Perak 334", "Himalayan 450", "Classic 350". Indian car
   * models rarely carry one, and the explicit car list above has already run,
   * so this is safe to treat as a bike signal rather than falling through to
   * the hatchback default. That default was giving a 334cc bike a car's
   * mileage, which is wrong by a factor of three.
   */
  const bare = q.match(/\b(\d{3,4})\b/);
  if (BIKE_BRANDS.test(q)) {
    return bare ? byDisplacement(Number(bare[1])) : 'motorcycle-mid';
  }
  if (bare && !CAR_MODELS.test(q)) {
    const n = Number(bare[1]);
    if (n >= 100 && n <= 1500) return byDisplacement(n);
  }

  return 'car-hatchback';
}

function byDisplacement(cc: number): VehicleClass {
  if (cc < 160) return 'motorcycle-small';
  if (cc < 400) return 'motorcycle-mid';
  return 'motorcycle-large';
}
