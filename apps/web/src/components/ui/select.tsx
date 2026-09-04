"use client";

import { forwardRef, useId, type ReactNode, type SelectHTMLAttributes } from "react";

type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
};

/** Chevron, matching the `icons.tsx` stroke family — selects have no shared
 * native affordance across browsers, so this makes the control legible as
 * "opens a list" without pulling in a second icon set. */
function Chevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 stroke-current text-[var(--color-ink-muted)] [stroke-width:2] [stroke-linecap:round] [stroke-linejoin:round]"
      fill="none"
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export const Select = forwardRef<HTMLSelectElement, Props>(function Select(
  { label, error, hint, id, className = "", children, ...props },
  ref,
) {
  const generatedId = useId();
  const fieldId = id ?? props.name ?? generatedId;

  return (
    <div className="block space-y-1.5">
      <label className="text-sm font-medium text-[var(--color-ink)]" htmlFor={fieldId}>
        {label}
      </label>
      <div className="relative">
        <select
          ref={ref}
          id={fieldId}
          className={[
            "min-h-11 w-full appearance-none rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 pr-9 text-base text-[var(--color-ink)] outline-none transition-[border-color,box-shadow] duration-[var(--duration-fast)] focus:border-[var(--color-primary)] focus:shadow-[0_0_0_3px_var(--color-ring)] disabled:cursor-not-allowed disabled:bg-[var(--color-neutral-subtle)] disabled:text-[var(--color-ink-muted)]",
            error
              ? "border-[var(--color-danger)] focus:border-[var(--color-danger)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-danger)_22%,transparent)]"
              : "",
            className,
          ].join(" ")}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
          {...props}
        >
          {children}
        </select>
        <Chevron />
      </div>
      {hint && !error ? (
        <span id={`${fieldId}-hint`} className="block text-xs text-[var(--color-ink-muted)]">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={`${fieldId}-error`} role="alert" className="block text-sm text-[var(--color-danger)]">
          {error}
        </span>
      ) : null}
    </div>
  );
});
