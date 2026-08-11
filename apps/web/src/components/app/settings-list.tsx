"use client";

import Link from "next/link";
import type { ComponentType, SVGProps } from "react";
import { IconChevronRight } from "@/components/ui/icons";

type IconType = ComponentType<SVGProps<SVGSVGElement> & { title?: string }>;

export function SettingsGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-xs font-semibold uppercase tracking-[0.06em] text-[var(--color-ink-muted)]">
        {title}
      </h2>
      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)]/80 bg-[var(--color-surface)]">
        {children}
      </div>
    </section>
  );
}

export function SettingsRow({
  href,
  title,
  description,
  Icon,
  onClick,
}: {
  href?: string;
  title: string;
  description?: string;
  Icon: IconType;
  onClick?: () => void;
}) {
  const className = [
    "flex min-h-12 w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors",
    "hover:bg-[var(--color-surface-subtle)] focus-visible:outline focus-visible:outline-2",
    "focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-focus)]",
    "border-b border-[var(--color-border)]/60 last:border-b-0",
  ].join(" ");

  const body = (
    <>
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] text-[var(--color-ink-muted)]"
        aria-hidden
      >
        <Icon className="h-[1.15rem] w-[1.15rem]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-[var(--color-ink)]">{title}</span>
        {description ? (
          <span className="mt-0.5 block text-xs leading-snug text-[var(--color-ink-muted)]">
            {description}
          </span>
        ) : null}
      </span>
      <IconChevronRight className="h-4 w-4 shrink-0 text-[var(--color-ink-subtle)]" aria-hidden />
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className} onClick={onClick}>
        {body}
      </Link>
    );
  }

  return (
    <button type="button" className={className} onClick={onClick}>
      {body}
    </button>
  );
}
