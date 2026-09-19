import { z } from 'zod';

/**
 * One schema per payload, imported by both the form and the route handler so
 * the rules cannot drift. These mirror the CHECK constraints in
 * database/schema.neon.sql — an invalid row cannot be written even by a direct
 * database call, but failing here gives the user a readable message instead of
 * a 23514.
 */

export const TRAVEL_MODES = ['Bike', 'Car', 'Train', 'Flight', 'Bus', 'Mixed'] as const;
export const TRIP_TYPES = [
  'Solo', 'Couple', 'Family', 'Friends', 'Group', 'Business', 'Photography', 'Adventure', 'Relaxation',
] as const;
export const BUDGET_TYPES = ['Budget', 'Moderate', 'Premium', 'Luxury', 'Custom'] as const;
export const FOOD_PREFS = [
  'Vegetarian', 'Non-Vegetarian', 'Vegan', 'Jain', 'Local Food', 'No Preference',
] as const;
export const HOTEL_PREFS = [
  'Budget', '3 Star', '4 Star', '5 Star', 'Homestay', 'Resort', 'Hostel', 'No Preference',
] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date.');

export const createTripSchema = z
  .object({
    trip_name: z.string().trim().min(1, 'Give the trip a name.').max(160),
    source: z.string().trim().min(1, 'Where are you starting from?').max(160),
    destination: z.string().trim().min(1, 'Where are you going?').max(160),
    start_date: isoDate,
    end_date: isoDate,
    travellers: z.coerce.number().int().min(1).max(40),
    travel_mode: z.enum(TRAVEL_MODES),
    trip_type: z.enum(TRIP_TYPES).optional(),
    budget_type: z.enum(BUDGET_TYPES).default('Moderate'),
    budget_amount: z.coerce.number().nonnegative().optional(),
    food_preference: z.enum(FOOD_PREFS).optional(),
    hotel_preference: z.enum(HOTEL_PREFS).optional(),
    interests: z.array(z.string()).default([]),
    special_requirements: z.string().max(2000).optional(),
  })
  .refine((d) => d.end_date >= d.start_date, {
    message: 'End date must be on or after the start date.',
    path: ['end_date'],
  })
  .refine((d) => dayCount(d.start_date, d.end_date) <= 365, {
    message: 'A trip cannot be longer than 365 days.',
    path: ['end_date'],
  })
  .refine((d) => d.budget_type !== 'Custom' || (d.budget_amount ?? 0) > 0, {
    message: 'Enter a maximum budget amount.',
    path: ['budget_amount'],
  });

export type CreateTripInput = z.infer<typeof createTripSchema>;

export function dayCount(start: string, end: string): number {
  const ms = Date.parse(end + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z');
  return Math.round(ms / 86_400_000) + 1;
}

/** Flatten a ZodError into { field: message } for rendering next to inputs. */
export function fieldErrors(e: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of e.issues) {
    const key = issue.path.join('.') || '_';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
