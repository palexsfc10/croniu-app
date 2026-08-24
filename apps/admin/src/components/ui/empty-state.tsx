import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] p-8 text-center">
      {icon ? <div className="text-[var(--color-ink-faint)]">{icon}</div> : null}
      <p className="text-sm font-semibold text-[var(--color-ink)]">{title}</p>
      {description ? <p className="max-w-sm text-sm text-[var(--color-ink-muted)]">{description}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
