import type { ReactNode } from "react";

type Rail = "primary" | "success" | "warning" | "danger" | "neutral";

export function Card({
  rail = "neutral",
  className = "",
  children,
}: {
  rail?: Rail;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={[
        "card-rail",
        rail !== "neutral" ? `card-rail-${rail}` : "",
        "p-4",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-[var(--color-ink)]">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-[var(--color-ink-muted)]">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
