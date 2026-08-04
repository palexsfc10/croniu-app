import type { ReactNode } from "react";

type Props = {
  title: string;
  description: string;
  action?: ReactNode;
  tone?: "neutral" | "success" | "primary";
};

export function EmptyState({ title, description, action, tone = "neutral" }: Props) {
  const toneClass =
    tone === "success"
      ? "border-[var(--color-success)]/25 bg-[var(--color-success-subtle)]/70"
      : tone === "primary"
        ? "border-[var(--color-primary)]/20 bg-[var(--color-primary-subtle)]/60"
        : "border-[var(--color-border)] bg-[var(--color-surface)]/80";

  return (
    <section
      className={[
        "rounded-[var(--radius-lg)] border border-dashed p-4",
        toneClass,
      ].join(" ")}
      aria-label={title}
    >
      <h2 className="text-base font-semibold text-[var(--color-ink)]">{title}</h2>
      <p className="mt-1 text-sm leading-relaxed text-[var(--color-ink-muted)]">{description}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </section>
  );
}
