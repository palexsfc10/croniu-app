"use client";

import { useId, type TextareaHTMLAttributes } from "react";

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  error?: string;
  hint?: string;
};

export function TextArea({ label, error, hint, id, className = "", ...props }: Props) {
  const generatedId = useId();
  const fieldId = id ?? props.name ?? generatedId;
  return (
    <div className="block space-y-1.5">
      <label className="text-sm font-medium text-[var(--color-ink)]" htmlFor={fieldId}>
        {label}
      </label>
      <textarea
        id={fieldId}
        className={[
          "min-h-24 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-base text-[var(--color-ink)] outline-none transition-[border-color,box-shadow] duration-[var(--duration-fast)] placeholder:text-[var(--color-ink-muted)] focus:border-[var(--color-primary)] focus:shadow-[0_0_0_3px_rgb(47_63_143_/_16%)]",
          error ? "border-[var(--color-danger)]" : "",
          className,
        ].join(" ")}
        aria-invalid={Boolean(error)}
        aria-describedby={
          error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined
        }
        {...props}
      />
      {hint && !error ? (
        <p id={`${fieldId}-hint`} className="text-xs text-[var(--color-ink-muted)]">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${fieldId}-error`} role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
