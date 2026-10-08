'use client';

import { useId, useState } from 'react';

/**
 * The few form pieces every auth screen shares, so sign-in, registration and
 * password reset stay visually identical without repeating themselves.
 */

export function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  hint?: string;
}) {
  const [shown, setShown] = useState(false);
  const hintId = useId();

  return (
    <>
      <label className="mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-ink3" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={shown ? 'text' : 'password'}
          autoComplete={autoComplete}
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={hint ? hintId : undefined}
          className="w-full rounded border border-line2 bg-white py-3.5 pl-3.5 pr-[72px] text-[15px] text-ink outline-none focus:border-ink"
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          // The control states what it will do; screen readers get the same words.
          aria-pressed={shown}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded bg-transparent px-2 py-1 text-[12px] font-semibold text-ink3 hover:text-ink"
        >
          {shown ? 'Hide' : 'Show'}
        </button>
      </div>
      {hint && (
        <p id={hintId} className="mt-1.5 text-[12px] text-ink3">
          {hint}
        </p>
      )}
    </>
  );
}

export function Alert({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="mt-4 rounded border border-danger bg-danger/5 px-3.5 py-3 text-[13.5px] text-danger">
      {children}
    </p>
  );
}

export function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="mt-4 rounded border border-line2 bg-sand/40 px-3.5 py-3 text-[13.5px] text-ink2">
      {children}
    </p>
  );
}

/** Minimum the UI enforces; Supabase enforces its own on top. */
export const MIN_PASSWORD = 8;

export function passwordProblem(password: string, confirm?: string): string {
  if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (confirm !== undefined && password !== confirm) return 'The two passwords do not match.';
  return '';
}
