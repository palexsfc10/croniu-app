"use client";

import { forwardRef, useId, useState, type InputHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: string;
  /** When true, shows a control to reveal/hide the password value. */
  revealable?: boolean;
};

export const TextField = forwardRef<HTMLInputElement, Props>(function TextField(
  { label, error, hint, id, className = "", revealable = false, type, ...props },
  ref,
) {
  const generatedId = useId();
  const fieldId = id ?? props.name ?? generatedId;
  const [visible, setVisible] = useState(false);
  const inputType = revealable ? (visible ? "text" : "password") : type;

  return (
    <div className="block space-y-1.5">
      <label className="text-sm font-medium text-[var(--color-ink)]" htmlFor={fieldId}>
        {label}
      </label>
      <div className="relative">
        <input
          ref={ref}
          id={fieldId}
          type={inputType}
          className={[
            "min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-base text-[var(--color-ink)] outline-none transition-[border-color,box-shadow] duration-[var(--duration-fast)] placeholder:text-[var(--color-ink-subtle)] focus:border-[var(--color-primary)] focus:shadow-[0_0_0_3px_var(--color-ring)] disabled:cursor-not-allowed disabled:bg-[var(--color-neutral-subtle)] disabled:text-[var(--color-ink-muted)]",
            revealable ? "pr-12" : "",
            error
              ? "border-[var(--color-danger)] focus:border-[var(--color-danger)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-danger)_22%,transparent)]"
              : "",
            className,
          ].join(" ")}
          aria-invalid={Boolean(error)}
          aria-describedby={
            error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined
          }
          {...props}
        />
        {revealable ? (
          <button
            type="button"
            className="absolute top-1/2 right-2 min-h-9 -translate-y-1/2 rounded-[var(--radius-sm)] px-2 text-xs font-semibold text-[var(--color-primary)] hover:bg-[var(--color-surface-muted)]"
            onClick={() => setVisible((value) => !value)}
            aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
            aria-pressed={visible}
          >
            {visible ? "Ocultar" : "Mostrar"}
          </button>
        ) : null}
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
