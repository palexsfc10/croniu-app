/**
 * Row derivation for the Ciclos central (contratos de clientes).
 *
 * Composes data already fetched in bulk — cycles, receivables, next
 * appointments, renewal cases — into one row per cycle. Every field is
 * real: nothing here invents progress, pendency or a renewal date the backend
 * does not already know.
 *
 * Deliberately NOT computed here:
 * - "progresso" when `lesson_count` is null (a cycle without a planned lesson
 *   count has no honest denominator — the row shows no bar at all).
 * - any renewal side effect. `renewalTarget` only produces a *link* into the
 *   flow that already exists; clicking it mutates nothing.
 * - renewal eligibility itself: `RenewalCase` (via `renewal-status.ts`'s
 *   `RenewalCaseIndex`) is the single source of truth for whether a cycle
 *   still needs a renewal decision. This file used to guess with a
 *   client+service+date heuristic (`findSuccessor`) — that duplicated the
 *   backend's own suppression rule and could disagree with it (e.g. a cycle
 *   explicitly closed via "Encerrar sem renovar" kept showing the badge,
 *   since the heuristic had no successor cycle to find). Removed in favor of
 *   consuming the same `/renewal-cases` projection every other screen uses.
 */

import type { Appointment, Cycle, Receivable } from "@/lib/api";
import type { BadgeTone } from "@/components/ui/badge";
import { cycleBucket, cycleListStatus, cycleListStatusTone } from "@/lib/cycle-period";
import {
  cycleRenewalCase,
  isNeedsDecisionStatus,
  type RenewalCaseIndex,
} from "@/lib/renewal-status";
import type { RenewalCaseView } from "@/lib/api";

export type CycleAlert = "renewal" | "financial" | "no_schedule";

export const CYCLE_ALERT_LABEL: Record<CycleAlert, string> = {
  renewal: "Renovação",
  financial: "Financeiro",
  no_schedule: "Sem agenda",
};

export type CycleRow = {
  cycle: Cycle;
  statusLabel: string;
  statusTone: BadgeTone;
  nextAppointment: Appointment | null;
  pendingCents: number;
  overdueCount: number;
  /** The RenewalCase tracking this cycle's renewal process, if one exists. */
  renewalCase: RenewalCaseView | null;
  alerts: CycleAlert[];
  progress: { done: number; total: number } | null;
};

function isPending(r: Receivable): boolean {
  return r.status === "pending" || r.status === "expected";
}

function isOverdue(r: Receivable, today: string): boolean {
  return isPending(r) && r.due_on < today;
}

export function buildCycleRow(
  cycle: Cycle,
  opts: {
    receivables: Receivable[];
    nextAppointmentByClientId: Record<string, Appointment>;
    renewalCases: RenewalCaseIndex;
    today: string;
  },
): CycleRow {
  const { receivables, nextAppointmentByClientId, renewalCases, today } = opts;

  const mine = receivables.filter((r) => r.cycle_id === cycle.id);
  const pending = mine.filter(isPending);
  const overdue = mine.filter((r) => isOverdue(r, today));
  const bucket = cycleBucket(cycle, today);
  const renewalCase = cycleRenewalCase(cycle.id, renewalCases);

  const alerts: CycleAlert[] = [];
  if (cycle.status !== "cancelled") {
    if (renewalCase && isNeedsDecisionStatus(renewalCase.display_status)) {
      alerts.push("renewal");
    }
    if (overdue.length > 0) alerts.push("financial");
    if (bucket === "active" && !cycle.weekdays?.length && !cycle.default_starts_time) {
      alerts.push("no_schedule");
    }
  }

  return {
    cycle,
    statusLabel: cycleListStatus(cycle, today),
    statusTone: cycleListStatusTone(cycle, today),
    // A cycle's next session is the client's next appointment; the agenda
    // endpoint is per-client, so this is only shown for the cycle that is
    // actually running now — otherwise it would attribute another cycle's
    // appointment to this row.
    nextAppointment:
      bucket === "active" ? (nextAppointmentByClientId[cycle.client_id] ?? null) : null,
    pendingCents: pending.reduce((sum, r) => sum + r.amount_cents, 0),
    overdueCount: overdue.length,
    renewalCase,
    alerts,
    progress:
      cycle.lesson_count != null
        ? { done: cycle.lessons_completed ?? 0, total: cycle.lesson_count }
        : null,
  };
}

export type CycleView = "renewing" | "active" | "upcoming" | "ended" | "attention" | "all";

export function matchesCycleView(row: CycleRow, view: CycleView, today: string): boolean {
  if (view === "all") return true;
  if (view === "attention") return row.alerts.length > 0;
  if (view === "renewing") {
    return cycleBucket(row.cycle, today) === "active" && row.cycle.is_nearing_end;
  }
  return cycleBucket(row.cycle, today) === view;
}

/**
 * Where "Preparar renovação" should go. Never mutates: when the client already
 * asked through the portal, the professional reviews the real request first;
 * otherwise we pre-fill the same cycle-creation form the renewal flow itself
 * lands on, seeding it from the source cycle. Both paths keep every existing
 * validation (conflito de agenda, disponibilidade, preço, duplicidade) and any
 * cycle duration — mensal, trimestral, semestral — because the duration comes
 * from the template, never from this link.
 */
export function renewalTarget(row: CycleRow, returnTo: string): string | null {
  if (!isRenewalEligible(row)) return null;
  if (row.renewalCase?.portal_requested) return "/app/renewals";
  const { cycle } = row;
  const params = new URLSearchParams({
    clientId: cycle.client_id,
    serviceId: cycle.service_id,
    renewedFrom: cycle.id,
  });
  if (cycle.cycle_template_id) params.set("templateId", cycle.cycle_template_id);
  if (cycle.weekdays?.length) params.set("weekdays", cycle.weekdays.join(","));
  params.set("returnTo", returnTo);
  return `/app/cycles/new?${params.toString()}`;
}

/** Only cycles that still need a renewal decision, per `RenewalCase` — not
 * cancelled, and either awaiting/pending/overdue/upcoming (never `renewed` or
 * `ended_without_renewal`). */
export function isRenewalEligible(row: CycleRow): boolean {
  if (row.cycle.status === "cancelled") return false;
  return row.alerts.includes("renewal");
}
