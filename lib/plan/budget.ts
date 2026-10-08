import type { Sourced, TravelMode } from '../providers/types.ts';
import { estimated } from '../providers/types.ts';

/**
 * Budget.
 *
 * Every figure here is an estimate and is typed as one. No provider was asked
 * what a hotel costs, so nothing in this file may claim to be verified — that
 * would be exactly the invented pricing section 31 forbids. When a hotel or
 * accommodation provider is wired in later, its real nightly rate replaces the
 * estimate and the provenance changes with it.
 *
 * The rates are Indian-road-trip typical and stated openly as assumptions, so a
 * user can see why a number came out the way it did rather than trusting it.
 */

export type BudgetLine = {
  label: string;
  amount: Sourced<number>;
  /** The arithmetic, in words, so the number is checkable. */
  workings: string;
};

export type Budget = {
  currency: string;
  lines: BudgetLine[];
  total: number;
  perPerson: number;
  perDay: number;
  travellers: number;
};

/** Litres per 100 km, and what a night typically costs, by mode. */
const PROFILE: Record<TravelMode, { lPer100km: number; tollPerKm: number; parkingPerNight: number }> = {
  motorcycle: { lPer100km: 2.9, tollPerKm: 0, parkingPerNight: 50 },
  car: { lPer100km: 6.5, tollPerKm: 1.2, parkingPerNight: 150 },
  bus: { lPer100km: 0, tollPerKm: 0, parkingPerNight: 0 },
  train: { lPer100km: 0, tollPerKm: 0, parkingPerNight: 0 },
  flight: { lPer100km: 0, tollPerKm: 0, parkingPerNight: 0 },
};

const FUEL_PER_LITRE = 105;   // INR, indicative
const HOTEL_PER_NIGHT = 2_200;
const MEAL = { breakfast: 150, lunch: 280, tea: 80, dinner: 320 };

export type BudgetInput = {
  /*
   * When the caller has run the vehicle fuel engine, its total replaces the
   * flat per-100km figure below. That figure knows nothing about the vehicle,
   * the terrain or the load; the engine knows all three, so its answer is the
   * better one wherever it is available.
   */
  fuelOverride?: { amount: number; basis: string };
  distanceKm: number;
  mode: TravelMode;
  nights: number;
  travellers: number;
  stops: string[];
  currency: string;
};

export function estimateBudget(input: BudgetInput): Budget {
  const p = PROFILE[input.mode];
  const lines: BudgetLine[] = [];
  const count = (kind: string) => input.stops.filter((s) => s === kind).length;

  if (input.fuelOverride) {
    lines.push({
      label: 'Fuel',
      amount: estimated(input.fuelOverride.amount, input.fuelOverride.basis),
      workings: input.fuelOverride.basis,
    });
  } else if (p.lPer100km > 0) {
    const litres = (input.distanceKm * p.lPer100km) / 100;
    const fuel = Math.round(litres * FUEL_PER_LITRE);
    lines.push({
      label: 'Fuel',
      amount: estimated(fuel, `${p.lPer100km} L/100km at ₹${FUEL_PER_LITRE}/L — no vehicle given`),
      workings: `${input.distanceKm.toFixed(0)} km → ${litres.toFixed(1)} L × ₹${FUEL_PER_LITRE}`,
    });
  }
  if (p.tollPerKm > 0) {
    const toll = Math.round(input.distanceKm * p.tollPerKm);
    lines.push({
      label: 'Tolls',
      amount: estimated(toll, `₹${p.tollPerKm}/km, typical of national highways`),
      workings: `${input.distanceKm.toFixed(0)} km × ₹${p.tollPerKm}`,
    });
  }
  if (input.nights > 0) {
    const hotel = input.nights * HOTEL_PER_NIGHT;
    lines.push({
      label: 'Accommodation',
      amount: estimated(hotel, `₹${HOTEL_PER_NIGHT}/night — no provider was asked for a real rate`),
      workings: `${input.nights} night(s) × ₹${HOTEL_PER_NIGHT}`,
    });
    if (p.parkingPerNight > 0) {
      lines.push({
        label: 'Parking',
        amount: estimated(input.nights * p.parkingPerNight, `₹${p.parkingPerNight}/night`),
        workings: `${input.nights} night(s) × ₹${p.parkingPerNight}`,
      });
    }
  }

  for (const [meal, rate] of Object.entries(MEAL) as [keyof typeof MEAL, number][]) {
    const n = count(meal);
    if (!n) continue;
    lines.push({
      label: meal[0].toUpperCase() + meal.slice(1),
      amount: estimated(n * rate * input.travellers, `₹${rate} per person`),
      workings: `${n} × ₹${rate} × ${input.travellers} traveller(s)`,
    });
  }

  const subtotal = lines.reduce((t, l) => t + l.amount.value, 0);
  const buffer = Math.round(subtotal * 0.1);
  lines.push({
    label: 'Emergency buffer',
    amount: estimated(buffer, '10% of the estimated total'),
    workings: `10% of ₹${subtotal}`,
  });

  const total = subtotal + buffer;
  const days = Math.max(1, input.nights + 1);
  return {
    currency: input.currency,
    lines,
    total,
    perPerson: Math.round(total / Math.max(1, input.travellers)),
    perDay: Math.round(total / days),
    travellers: input.travellers,
  };
}
