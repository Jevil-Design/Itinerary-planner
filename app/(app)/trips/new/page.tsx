'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  TRAVEL_MODES, TRIP_TYPES, BUDGET_TYPES, FOOD_PREFS, HOTEL_PREFS,
  createTripSchema, fieldErrors, dayCount,
} from '@/lib/validation';

const field = 'w-full rounded border border-line bg-white px-3.5 py-3 outline-none focus:border-ink';
const label = 'mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-ink3';

export default function NewTripPage() {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  const days = start && end && end >= start ? dayCount(start, end) : null;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    setFormError('');

    const fd = new FormData(e.currentTarget);
    const raw = {
      ...Object.fromEntries(fd.entries()),
      interests: fd.getAll('interests').map(String),
      budget_amount: fd.get('budget_amount') || undefined,
      trip_type: fd.get('trip_type') || undefined,
      special_requirements: fd.get('special_requirements') || undefined,
    };

    // Validate client-side with the same schema the route uses, so the round
    // trip is skipped for errors the browser can already see.
    const parsed = createTripSchema.safeParse(raw);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/trips', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      const body = await res.json();

      if (!res.ok) {
        setErrors(body?.error?.fields ?? {});
        setFormError(body?.error?.message ?? 'Something went wrong.');
        return;
      }
      router.push('/trips');
      router.refresh();
    } catch {
      setFormError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mx-auto max-w-2xl">
      <h1 className="m-0 text-3xl font-normal tracking-tight">Where are you going?</h1>
      <p className="mb-6 mt-1.5 text-[13.5px] text-ink2">
        Source, destination and dates are all the engine needs. Everything after that only sharpens
        the result.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={label} htmlFor="trip_name">Trip name</label>
          <input id="trip_name" name="trip_name" className={field} placeholder="Name this trip" />
          <FieldError msg={errors.trip_name} />
        </div>

        <div>
          <label className={label} htmlFor="source">Source</label>
          <input id="source" name="source" className={field} placeholder="Where from?" />
          <FieldError msg={errors.source} />
        </div>

        <div>
          <label className={label} htmlFor="destination">Destination</label>
          <input id="destination" name="destination" className={field} placeholder="Where are you going?" />
          <FieldError msg={errors.destination} />
        </div>

        <div>
          <label className={label} htmlFor="start_date">Start date</label>
          <input id="start_date" name="start_date" type="date" className={field}
                 value={start} onChange={(e) => setStart(e.target.value)} />
          <FieldError msg={errors.start_date} />
        </div>

        <div>
          <label className={label} htmlFor="end_date">End date</label>
          <input id="end_date" name="end_date" type="date" className={field}
                 value={end} onChange={(e) => setEnd(e.target.value)} />
          <FieldError msg={errors.end_date} />
        </div>

        <div>
          <label className={label} htmlFor="travellers">Travellers</label>
          <input id="travellers" name="travellers" type="number" min={1} max={40}
                 defaultValue={2} className={field} />
          <FieldError msg={errors.travellers} />
        </div>

        <div className="flex items-center rounded border border-line bg-surf px-3.5">
          <div>
            <div className="text-lg">{days ?? '—'}</div>
            <div className="text-[9px] uppercase tracking-wide text-ink3">Days</div>
          </div>
        </div>

        <Select name="travel_mode" title="Travel mode" options={TRAVEL_MODES} />
        <Select name="trip_type" title="Trip type" options={TRIP_TYPES} allowBlank />
        <Select name="budget_type" title="Budget" options={BUDGET_TYPES} defaultValue="Moderate" />

        <div>
          <label className={label} htmlFor="budget_amount">Maximum budget (optional)</label>
          <input id="budget_amount" name="budget_amount" type="number" min={0}
                 className={field} placeholder="60000" />
          <FieldError msg={errors.budget_amount} />
        </div>

        <Select name="food_preference" title="Food preference" options={FOOD_PREFS} allowBlank />
        <Select name="hotel_preference" title="Hotel preference" options={HOTEL_PREFS} allowBlank />

        <div className="sm:col-span-2">
          <label className={label} htmlFor="special_requirements">Additional requirements</label>
          <textarea id="special_requirements" name="special_requirements" rows={3}
                    className={`${field} resize-y`}
                    placeholder="Anything the plan should account for — vehicles, accessibility, must-dos." />
        </div>
      </div>

      {formError && (
        <p role="alert" className="mt-4 rounded border border-danger bg-danger/5 px-3.5 py-3 text-[13px] text-danger">
          {formError}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="mt-6 w-full rounded bg-ink py-4 text-[15px] font-bold text-white hover:opacity-80 disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Create trip'}
      </button>
    </form>
  );
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="mt-1.5 text-xs text-danger">{msg}</p>;
}

function Select({
  name, title, options, allowBlank, defaultValue,
}: {
  name: string; title: string; options: readonly string[]; allowBlank?: boolean; defaultValue?: string;
}) {
  return (
    <div>
      <label className={label} htmlFor={name}>{title}</label>
      <select id={name} name={name} defaultValue={defaultValue} className={`${field} cursor-pointer`}>
        {allowBlank && <option value="">No preference</option>}
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}
