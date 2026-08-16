import Link from "next/link";
import type { ReactNode } from "react";
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
  summary: string;
  detail?: string | null;
  primary?: AccompanimentAction | null;
  secondary?: AccompanimentAction | null;
  extras?: AccompanimentAction[];
};

export function AccompanimentCard({
  icon,
  title,
  testId,
  state,
  summary,
  detail,
  primary,
  secondary,
  extras = [],
}: Props) {
  const actions = [primary, secondary].filter(Boolean) as AccompanimentAction[];
  const twoCol = actions.length === 2 && actions.every((a) => a.label.length <= 16);

  return (
    <article
      data-testid={testId}
      className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-[0_1px_2px_rgba(15,15,20,0.04)]"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-surface-subtle)] text-[var(--color-ink-muted)]">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-sm font-semibold">{title}</h2>
            {state ? (
              <span className="shrink-0 text-xs font-medium text-[var(--color-ink-muted)]">
                {state}
              </span>
            ) : null}
          </div>
          <p className="text-sm text-[var(--color-ink)]">{summary}</p>
          {detail ? <p className="text-sm text-[var(--color-ink-muted)]">{detail}</p> : null}
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
