import type { Cycle } from "@/lib/api";
import { addDaysIso, endOfMonth, rangesOverlap, startOfMonth } from "@/lib/date-format";

export type CycleBucket = "active" | "upcoming" | "ended" | "all";
export type PeriodPreset = "this_month" | "next_30" | "last_30" | "custom" | "month";

export function cycleBucket(cycle: Cycle, today: string): CycleBucket {
  if (cycle.status === "ended" || cycle.status === "completed" || cycle.status === "cancelled") {
    return "ended";
  }
  if (cycle.starts_on > today) return "upcoming";
  return "active";
}

export function periodBounds(
  preset: PeriodPreset,
  today: string,
  monthCursor: string,
  customStart?: string,
  customEnd?: string,
): { start: string; end: string } | null {
  if (preset === "this_month") {
    return { start: startOfMonth(today), end: endOfMonth(today) };
  }
  if (preset === "next_30") {
    return { start: today, end: addDaysIso(today, 30) };
  }
  if (preset === "last_30") {
    return { start: addDaysIso(today, -30), end: today };
  }
  if (preset === "month") {
    return { start: startOfMonth(monthCursor), end: endOfMonth(monthCursor) };
  }
  if (preset === "custom" && customStart && customEnd) {
    return customStart <= customEnd
      ? { start: customStart, end: customEnd }
      : { start: customEnd, end: customStart };
  }
  return null;
}

export function cycleInPeriod(cycle: Cycle, start: string, end: string): boolean {
  return rangesOverlap(cycle.starts_on, cycle.ends_on, start, end);
}

export function cycleListStatus(cycle: Cycle, today: string): string {
  if (cycle.status === "cancelled") return "Cancelado";
  if (cycle.status === "ended" || cycle.status === "completed") return "Encerrado";
  if (cycle.starts_on > today) return "Aguardando início";
  if (cycle.is_nearing_end) return "Termina em breve";
  if (cycle.status === "paused") return "Pausado";
  if (!cycle.weekdays?.length && !cycle.default_starts_time) return "Sem agenda";
  return "Ativo";
}

export function filterCycles(
  items: Cycle[],
  opts: {
    bucket: CycleBucket;
    today: string;
    period: { start: string; end: string } | null;
  },
): Cycle[] {
  return items.filter((cycle) => {
    if (opts.bucket !== "all" && cycleBucket(cycle, opts.today) !== opts.bucket) return false;
    if (opts.period && !cycleInPeriod(cycle, opts.period.start, opts.period.end)) return false;
    return true;
  });
}
