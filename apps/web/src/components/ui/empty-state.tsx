import type { ReactNode } from "react";

type Props = {
  title: string;
  description: string;
  action?: ReactNode;
};

export function EmptyState({ title, description, action }: Props) {
  return (
    <section
      className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]/80 p-4"
      aria-label={title}
    >
      <h2 className="text-base font-semibold text-[var(--color-ink)]">{title}</h2>
      <p className="mt-1 text-sm leading-relaxed text-[var(--color-ink-muted)]">{description}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </section>
  );
}
