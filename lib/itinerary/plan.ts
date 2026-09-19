import type { Trip } from '@/lib/queries/trips';

/**
 * The deterministic half of a plan: everything that follows from the trip's own
 * fields without asking anyone. Days and their dates, one route leg, a packing
 * list keyed to how you are travelling, the pre-trip checklist, and the budget
 * categories worth filling in.
 *
 * Deliberately absent: activities, stays, restaurants, sightseeing, weather,
 * distances and prices. Those require the routing, places, weather and AI
 * providers. Guessing them would put unsourced claims in front of a user about
 * to spend money, which is the one thing this product promises not to do.
 */

export type PlanDay = {
  day_number: number;
  date: string;
  title: string;
  location: string;
  summary: string;
};

export type PlanRoute = {
  route_order: number;
  from_location: string;
  to_location: string;
};

export type PlanPackingItem = { category: string; item_name: string; quantity: number };
export type PlanChecklistItem = { label: string; item_order: number };
export type PlanExpense = { category: string; currency: string; expense_date: string };

export type Plan = {
  days: PlanDay[];
  routes: PlanRoute[];
  packing: PlanPackingItem[];
  checklist: PlanChecklistItem[];
  expenses: PlanExpense[];
};

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const MODE_PACKING: Record<string, [string, string][]> = {
  Bike: [
    ['Bike Gear', 'Helmet'],
    ['Bike Gear', 'Riding jacket and gloves'],
    ['Bike Gear', 'Puncture repair kit and tyre inflator'],
    ['Bike Gear', 'Chain lube and basic tools'],
    ['Documents', 'Licence, registration and insurance'],
  ],
  Car: [
    ['Documents', 'Licence, registration and insurance'],
    ['Travel Gear', 'Phone mount and car charger'],
    ['Travel Gear', 'Jump leads'],
  ],
  Train: [['Documents', 'Ticket or PNR'], ['Travel Gear', 'Neck pillow']],
  Flight: [['Documents', 'Boarding pass'], ['Travel Gear', 'Cabin-size liquids bag']],
  Bus: [['Documents', 'Ticket'], ['Travel Gear', 'Neck pillow']],
  Mixed: [['Documents', 'Tickets for each leg']],
};

export function buildPlan(trip: Trip): Plan {
  const days: PlanDay[] = [];
  for (let i = 0; i < trip.number_of_days; i++) {
    days.push({
      day_number: i + 1,
      date: addDays(trip.start_date, i),
      title: i === 0 ? `${trip.source} → ${trip.destination}` : `In ${trip.destination}`,
      location: trip.destination,
      summary: '',
    });
  }

  const routes: PlanRoute[] = [
    { route_order: 1, from_location: trip.source, to_location: trip.destination },
  ];

  const common: [string, string][] = [
    ['Documents', 'Photo ID'],
    ['Documents', 'Travel insurance'],
    ['Documents', 'Printed itinerary and emergency contacts'],
    ['Clothing', `Clothes for ${trip.number_of_days} days`],
    ['Toiletries', 'Toiletries and any medication'],
    ['Electronics', 'Phone charger'],
    ['Electronics', 'Power bank'],
    ['Travel Gear', 'First aid kit'],
    ['Weather Items', 'Rain layer'],
    ['Weather Items', 'Sunscreen'],
  ];
  const packing: PlanPackingItem[] = common
    .concat(MODE_PACKING[trip.travel_mode] ?? [])
    .map(([category, item_name]) => ({ category, item_name, quantity: 1 }));

  const drives = trip.travel_mode === 'Bike' || trip.travel_mode === 'Car';
  const checklist: PlanChecklistItem[] = [
    'Confirm stays for every night',
    'Check documents are valid and carried',
    drives
      ? 'Service the vehicle — brakes, tyres, fluids'
      : 'Confirm tickets and seat allocation',
    'Check the weather 48 hours before departure',
    'Download offline maps for the route',
    'Sort cash and payment methods',
    'Share the itinerary with someone at home',
    'Finish packing',
  ].map((label, item_order) => ({ label, item_order }));

  const currency = trip.currency || 'INR';
  const categories = ['Transportation', 'Hotel', 'Food', 'Activities']
    .concat(drives ? ['Fuel', 'Toll', 'Parking'] : ['Local Transport'])
    .concat(['Miscellaneous', 'Emergency Buffer']);
  const expenses: PlanExpense[] = categories.map((category) => ({
    category,
    currency,
    expense_date: trip.start_date,
  }));

  return { days, routes, packing, checklist, expenses };
}
