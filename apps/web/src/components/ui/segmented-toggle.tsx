type Props = {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  /** Square-ish minimum width — for compact single-glyph options like weekday initials. */
  square?: boolean;
  type?: "button";
};

/**
 * Shared visual for "pick one of a few presets" toggle buttons (service
 * duration, cycle frequency/period, weekday selection). Previously each
 * screen reimplemented the same active/inactive className logic inline —
 * consolidating it here means one place to keep the active-state contrast,
 * radius, and touch target consistent, and gives every instance
 * `aria-pressed` (some call sites had it, most didn't).
 */
export function SegmentedToggle({ active, onClick, children, square = false }: Props) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={[
        "min-h-11 rounded-[var(--radius-md)] border px-3 text-sm font-semibold transition-colors",
        square ? "min-w-11" : "",
        active
          ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
          : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink)]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
