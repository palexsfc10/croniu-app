"use client";

type Option = { value: string; label: string };

type Props = {
  name: string;
  legend: string;
  hint?: string;
  optional?: boolean;
  multiple?: boolean;
  options: Option[];
  value: string | string[];
  onChange: (next: string | string[]) => void;
  describedBy?: string;
};

export function ChoiceGroup({
  name,
  legend,
  hint,
  optional,
  multiple,
  options,
  value,
  onChange,
  describedBy,
}: Props) {
  const selected = Array.isArray(value) ? value : value ? [value] : [];
  const hintId = hint ? `${name}-hint` : undefined;

  function toggle(opt: string) {
    if (multiple) {
      const set = new Set(selected);
      if (set.has(opt)) set.delete(opt);
      else set.add(opt);
      onChange(Array.from(set));
      return;
    }
    onChange(opt);
  }

  return (
    <fieldset className="space-y-2" aria-describedby={describedBy || hintId}>
      <legend className="text-sm font-medium text-[var(--color-ink)]">
        {legend}
        {optional ? (
          <span className="ml-1 font-normal text-[var(--color-ink-muted)]">Opcional</span>
        ) : null}
      </legend>
      {hint ? (
        <p id={hintId} className="text-xs text-[var(--color-ink-muted)]">
          {hint}
        </p>
      ) : null}
      <div
        role={multiple ? "group" : "radiogroup"}
        className="flex flex-wrap gap-2"
      >
        {options.map((opt) => {
          const on = selected.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              role={multiple ? "checkbox" : "radio"}
              aria-checked={on}
              onClick={() => toggle(opt.value)}
              className={[
                "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-medium transition-colors",
                on
                  ? "border-[var(--color-primary)] bg-[var(--color-primary-subtle)] text-[var(--color-primary)]"
                  : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink)]",
              ].join(" ")}
            >
              {on ? (
                <span aria-hidden className="text-[0.7rem] font-bold">
                  ✓
                </span>
              ) : null}
              {opt.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
