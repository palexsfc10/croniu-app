import type { InputHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
};

export function TextField({ label, error, id, className = "", ...props }: Props) {
  const fieldId = id ?? props.name;
  return (
    <label className="block space-y-1.5" htmlFor={fieldId}>
      <span className="text-sm font-medium">{label}</span>
      <input
        id={fieldId}
        className={[
          "min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-base outline-none focus:border-[var(--color-primary)]",
          error ? "border-[var(--color-danger)]" : "",
          className,
        ].join(" ")}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${fieldId}-error` : undefined}
        {...props}
      />
      {error ? (
        <span id={`${fieldId}-error`} role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </span>
      ) : null}
    </label>
  );
}
