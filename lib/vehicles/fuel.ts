import type { Sourced } from '../providers/types.ts';
import { estimated } from '../providers/types.ts';
import { matchVehicle, type Vehicle, type VehicleMatch } from './catalogue.ts';

/**
 * Fuel: how much, and what it costs.
 *
 * Pure arithmetic over stated assumptions. Nothing here calls a provider, and
 * nothing here is verified — real-world mileage is not something any API
 * publishes, so every figure is typed as an estimate with its basis attached
 * and reaches the screen labelled that way.
 *
 * Three inputs decide the answer, in order of how much they should be trusted:
 *
 *   1. the user's own mileage, if they gave one — they have measured it
 *   2. the catalogue figure for their vehicle
 *   3. a class average, when the vehicle is unknown
 *
 * The terrain adjustment then moves that figure, because the same bike returns
 * very different numbers on a highway and on a hill road, and a trip to Sikkim
 * is mostly the second.
 */

export type Terrain = 'highway' | 'city' | 'mountain' | 'mixed';

/**
 * Multipliers against the base figure.
 *
 * Mountain is the heaviest penalty and the one that matters most here: sustained
 * climbing, low gears and hairpins cost far more than the distance suggests.
 * Treating a hill route as if it were a highway is the single easiest way to
 * under-budget a trip by a third.
 */
const TERRAIN_FACTOR: Record<Terrain, number> = {
  highway: 1.06,
  mixed: 1.0,
  city: 0.88,
  mountain: 0.82,
};

const TERRAIN_NOTE: Record<Terrain, string> = {
  highway: 'steady speeds, few stops',
  mixed: 'a mix of highway and town',
  city: 'stop-start traffic',
  mountain: 'sustained climbing and low gears',
};

/** Load tells against mileage too, and a touring bike is rarely empty. */
const LOAD_FACTOR = (travellers: number, luggage: boolean): number => {
  const extra = Math.max(0, travellers - 1) * 0.03;
  return 1 - extra - (luggage ? 0.03 : 0);
};

export type FuelPriceSource = 'user' | 'estimate';

export type FuelInput = {
  vehicleInput: string;
  /** km/l the user says they actually get. Overrides everything else. */
  userKmpl?: number;
  /** Rupees per litre. Without one, a stated default is used and labelled. */
  fuelPricePerLitre?: number;
  travellers?: number;
  luggage?: boolean;
};

export type Segment = {
  label: string;
  distanceKm: number;
  terrain: Terrain;
};

export type SegmentFuel = {
  label: string;
  distanceKm: number;
  terrain: Terrain;
  /** Adjusted km/l used for this leg. */
  effectiveKmpl: number;
  litres: number;
  cost: number;
  basis: string;
};

export type FuelEstimate = {
  vehicle: Vehicle;
  match: VehicleMatch;
  /** Where the base mileage came from, in words a user can judge. */
  mileageBasis: string;
  baseKmpl: Sourced<number>;
  pricePerLitre: Sourced<number>;
  priceSource: FuelPriceSource;
  segments: SegmentFuel[];
  totalDistanceKm: number;
  totalLitres: Sourced<number>;
  totalCost: Sourced<number>;
  costPerDay: number | null;
  costPerPerson: number;
  /** Full tanks the trip needs, for planning refuelling stops. */
  refuelsNeeded: number;
  rangePerTankKm: number;
  notes: string[];
};

/**
 * Indicative only, and labelled as such wherever it is shown.
 *
 * No live fuel-price provider is wired. Quoting a stale number as today's price
 * would be exactly the fabrication the brief forbids, so this is explicitly an
 * assumption the user is invited to replace.
 */
export const ASSUMED_PETROL_PRICE = 105;
export const ASSUMED_DIESEL_PRICE = 93;

export function estimateFuel(
  input: FuelInput,
  segments: Segment[],
  days?: number,
): FuelEstimate {
  const match = matchVehicle(input.vehicleInput);
  const vehicle = match.vehicle;
  const travellers = Math.max(1, input.travellers ?? 1);
  const notes: string[] = [];

  // --- base mileage ---------------------------------------------------------
  let baseKmpl: number;
  let mileageBasis: string;
  if (input.userKmpl && input.userKmpl > 0) {
    baseKmpl = input.userKmpl;
    mileageBasis = `${input.userKmpl} km/l, as you entered`;
  } else {
    baseKmpl = vehicle.realWorldKmpl;
    mileageBasis =
      match.confidence === 'catalogue'
        ? `${baseKmpl} km/l, a conservative real-world figure for a ${vehicle.name} — not the manufacturer's claim`
        : `${baseKmpl} km/l, typical of a ${vehicle.vehicleClass.replace('-', ' ')}`;
    if (match.confidence !== 'catalogue') notes.push(match.note);
  }

  // --- price ----------------------------------------------------------------
  const defaultPrice = vehicle.fuel === 'diesel' ? ASSUMED_DIESEL_PRICE : ASSUMED_PETROL_PRICE;
  const priceSource: FuelPriceSource = input.fuelPricePerLitre ? 'user' : 'estimate';
  const price = input.fuelPricePerLitre ?? defaultPrice;
  if (priceSource === 'estimate') {
    notes.push(
      `Fuel priced at a flat ₹${price}/L. No live price feed is connected, so this is an assumption — enter the price you actually pay for a closer figure.`,
    );
  }

  const load = LOAD_FACTOR(travellers, input.luggage ?? false);
  if (load < 1) {
    notes.push(
      `Mileage reduced by ${Math.round((1 - load) * 100)}% for ${travellers} traveller(s)${input.luggage ? ' and luggage' : ''}.`,
    );
  }

  // --- per segment ----------------------------------------------------------
  const out: SegmentFuel[] = segments.map((s) => {
    const effective = Math.max(1, baseKmpl * TERRAIN_FACTOR[s.terrain] * load);
    const litres = s.distanceKm / effective;
    return {
      label: s.label,
      distanceKm: Math.round(s.distanceKm * 10) / 10,
      terrain: s.terrain,
      effectiveKmpl: Math.round(effective * 10) / 10,
      litres: Math.round(litres * 100) / 100,
      cost: Math.round(litres * price),
      basis: `${Math.round(effective * 10) / 10} km/l — ${TERRAIN_NOTE[s.terrain]}`,
    };
  });

  const totalDistanceKm = Math.round(out.reduce((t, s) => t + s.distanceKm, 0) * 10) / 10;
  const totalLitres = Math.round(out.reduce((t, s) => t + s.litres, 0) * 100) / 100;
  const totalCost = out.reduce((t, s) => t + s.cost, 0);

  const avgEffective = totalLitres > 0 ? totalDistanceKm / totalLitres : baseKmpl;
  const rangePerTankKm = Math.round(vehicle.tankLitres * avgEffective);
  // A tank is never run to empty on a trip; refuelling at ~80% is the realistic
  // assumption, and rounding up is the safe direction to be wrong in.
  const refuelsNeeded = rangePerTankKm > 0 ? Math.max(0, Math.ceil(totalDistanceKm / (rangePerTankKm * 0.8)) - 1) : 0;

  return {
    vehicle,
    match,
    mileageBasis,
    baseKmpl: estimated(baseKmpl, mileageBasis),
    pricePerLitre: estimated(price, priceSource === 'user' ? 'the price you entered' : `assumed ₹${price}/L — no live price feed`),
    priceSource,
    segments: out,
    totalDistanceKm,
    totalLitres: estimated(totalLitres, `${totalDistanceKm} km at an effective ${Math.round(avgEffective * 10) / 10} km/l`),
    totalCost: estimated(totalCost, `${totalLitres} L × ₹${price}/L`),
    costPerDay: days && days > 0 ? Math.round(totalCost / days) : null,
    costPerPerson: Math.round(totalCost / travellers),
    refuelsNeeded,
    rangePerTankKm,
    notes,
  };
}

/**
 * Splits a route into segments by terrain, from the elevation of its points.
 *
 * Crude on purpose: without an elevation provider the only signal available is
 * how far north and how high the destination is. It is better than assuming the
 * whole route is highway, and it is labelled an estimate like everything else.
 * When an elevation API is connected this is the one function to replace.
 */
export function terrainFor(distanceKm: number, destinationName: string): Terrain {
  const d = destinationName.toLowerCase();
  if (/darjeeling|sikkim|gangtok|manali|leh|ladakh|shimla|mussoorie|nainital|ooty|munnar|kodaikanal|spiti|kedarnath|badrinath|tawang|shillong/.test(d)) {
    return 'mountain';
  }
  if (distanceKm < 40) return 'city';
  if (distanceKm > 150) return 'highway';
  return 'mixed';
}
