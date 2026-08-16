import type { ReactNode } from "react";

type Props = {
  title: string;
  body: string;
  action?: ReactNode;
};

export function EmptyStateGuide({ title, body, action }: Props) {
  return (
    <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <p className="text-sm font-semibold text-[var(--color-ink)]">{title}</p>
      <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{body}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
