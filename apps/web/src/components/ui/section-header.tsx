import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  action?: ReactNode;
  /** A tonal icon tile shown before the title — see `.icon-tile` in
   * globals.css. Pass an `Icon*` from `icons.tsx`. */
  icon?: ReactNode;
  tone?: "primary" | "ai" | "success" | "warning" | "danger" | "info" | "progress" | "neutral";
};

/**
 * The recurring "eyebrow row" above a block of content: an optional tonal
 * icon, a title, an optional one-line description, and a right-aligned
 * action (a link, a filter, a button). Every page built this by hand with
 * its own heading size and spacing — this is the one place that pairing
 * lives now.
 */
export function SectionHeader({ title, description, action, icon, tone = "primary" }: Props) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <span className={`icon-tile icon-tile-${tone} h-9 w-9`} aria-hidden>
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-[var(--color-ink)]">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-sm text-[var(--color-ink-muted)]">{description}</p>
          ) : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
