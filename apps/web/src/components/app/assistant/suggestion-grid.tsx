"use client";

import type { ComponentType, SVGProps } from "react";
import {
  IconCalendarDays,
  IconCalendarPlus,
  IconHome,
  IconRefreshCw,
  IconUsersRound,
} from "@/components/ui/icons";
import type { AssistantSuggestion } from "./types";

const ICONS: Record<
  AssistantSuggestion["icon"],
  ComponentType<SVGProps<SVGSVGElement>>
> = {
  day: IconHome,
  attention: IconUsersRound,
  cycles: IconRefreshCw,
  appointment: IconCalendarPlus,
};

export function SuggestionGrid({
  items,
  disabled,
  onPick,
}: {
  items: AssistantSuggestion[];
  disabled?: boolean;
  onPick: (prompt: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 max-[360px]:grid-cols-1">
      {items.map((item) => {
        const Icon = ICONS[item.icon] || IconCalendarDays;
        return (
          <button
            key={item.id}
            type="button"
            disabled={disabled}
            onClick={() => onPick(item.prompt)}
            className={[
              "group flex min-h-12 items-center gap-2.5 rounded-[var(--radius-lg)] border border-[var(--color-border)]/80",
              "bg-[var(--color-surface)] px-3 py-2.5 text-left shadow-sm",
              "transition-[transform,background-color,border-color] duration-[var(--duration-fast)]",
              "hover:border-[var(--color-ai-border)] hover:bg-[var(--color-ai-subtle)]/40",
              "active:scale-[0.98] disabled:opacity-50",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]",
              "motion-reduce:active:scale-100",
            ].join(" ")}
          >
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-ai-subtle)] text-[var(--color-ai)]"
              aria-hidden
            >
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 text-sm font-semibold text-[var(--color-ink)]">
              {item.title}
            </span>
          </button>
        );
      })}
    </div>
  );
}
