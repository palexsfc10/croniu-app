type Props = {
  label?: string | null;
};

/** Thin contextual strip under the app header — does not alter brand chrome. */
export function ContextualBar({ label }: Props) {
  if (!label) return null;
  return (
    <div
      role="status"
      className="border-b border-[var(--color-border)]/70 bg-[var(--color-surface-muted)] px-4 py-2 text-xs text-[var(--color-ink-muted)]"
    >
      {label}
    </div>
  );
}
