"use client";

import { forwardRef, useState, type InputHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  /** When true, shows a control to reveal/hide the password value. */
  revealable?: boolean;
};

export const TextField = forwardRef<HTMLInputElement, Props>(function TextField(
  { label, error, id, className = "", revealable = false, type, ...props },
  ref,
) {
  const fieldId = id ?? props.name;
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
            "min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-base text-[var(--color-ink)] outline-none transition-[border-color,box-shadow] duration-[var(--duration-fast)] placeholder:text-[var(--color-ink-muted)] focus:border-[var(--color-primary)] focus:shadow-[0_0_0_3px_rgb(47_63_143_/_16%)]",
            revealable ? "pr-12" : "",
            error ? "border-[var(--color-danger)]" : "",
            className,
          ].join(" ")}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${fieldId}-error` : undefined}
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
      {error ? (
        <span id={`${fieldId}-error`} role="alert" className="block text-sm text-[var(--color-danger)]">
          {error}
        </span>
      ) : null}
    </div>
  );
});
