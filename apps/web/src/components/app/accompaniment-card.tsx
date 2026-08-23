import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type AccompanimentAction = {
  href: string;
  label: string;
  variant?: "primary" | "secondary";
};

type Props = {
  icon: ReactNode;
  title: string;
  testId?: string;
  state?: string | null;
  /** Semantic tone for `state` — defaults to neutral when omitted, never
   * left as unstyled text so an urgent state can't blend into the rest. */
  stateTone?: BadgeTone;
  summary: string;
  detail?: string | null;
  progress?: { value: number; max: number } | null;
  primary?: AccompanimentAction | null;
  secondary?: AccompanimentAction | null;
  extras?: AccompanimentAction[];
};

export function AccompanimentCard({
  icon,
  title,
  testId,
  state,
  stateTone = "neutral",
  summary,
  detail,
  progress,
  primary,
  secondary,
  extras = [],
}: Props) {
  const progressPercent =
    progress && progress.max > 0
      ? Math.max(0, Math.min(100, Math.round((progress.value / progress.max) * 100)))
      : null;
  const actions = [primary, secondary].filter(Boolean) as AccompanimentAction[];
  const twoCol = actions.length === 2 && actions.every((a) => a.label.length <= 16);

  return (
    <article
      data-testid={testId}
      className="h-full rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-surface-subtle)] text-[var(--color-ink-muted)]">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-sm font-semibold">{title}</h2>
            {state ? (
              <Badge tone={stateTone} className="shrink-0">
                {state}
              </Badge>
            ) : null}
          </div>
          <p className="text-sm text-[var(--color-ink)]">{summary}</p>
          {detail ? <p className="text-sm text-[var(--color-ink-muted)]">{detail}</p> : null}
          {progressPercent !== null ? (
            <div
              className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-subtle)]"
              role="progressbar"
              aria-valuenow={progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${title}: ${progressPercent}% concluído`}
            >
              <div
                className="h-full rounded-full bg-[var(--color-primary)] transition-[width]"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          ) : null}
          {actions.length ? (
            <div
              className={
                twoCol
                  ? "mt-2 grid grid-cols-2 gap-2"
                  : "mt-2 flex flex-col gap-2"
              }
            >
              {actions.map((action) => (
                <Link key={action.href + action.label} href={action.href} className="min-w-0">
                  <Button
                    variant={action.variant ?? "secondary"}
                    fullWidth
                    className="w-full"
                  >
                    {action.label}
                  </Button>
                </Link>
              ))}
            </div>
          ) : null}
          {extras.length ? (
            <details className="mt-2">
              <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-[var(--color-ink-muted)]">
                Mais
              </summary>
              <div className="mt-1 flex flex-col gap-1">
                {extras.map((extra) => (
                  <Link
                    key={extra.href}
                    href={extra.href}
                    className="flex min-h-11 items-center text-sm text-[var(--color-link)]"
                  >
                    {extra.label}
                  </Link>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      </div>
    </article>
  );
}
