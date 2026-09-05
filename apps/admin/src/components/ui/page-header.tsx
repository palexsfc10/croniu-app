import type { ReactNode } from "react";

export function PageHeader({ title, description, actions, eyebrow = "Administração da plataforma" }: {
  title: string; description: string; actions?: ReactNode; eyebrow?: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-ink-muted)]">{eyebrow}</p>
        <h1 className="h-display text-2xl sm:text-3xl">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--color-ink-muted)]">{description}</p>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
