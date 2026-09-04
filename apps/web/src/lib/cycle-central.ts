/**
 * Row derivation for the Ciclos central (contratos de clientes).
 *
 * Composes data already fetched in bulk — cycles, receivables, next
 * appointments, open renewal requests — into one row per cycle. Every field is
 * real: nothing here invents progress, pendency or a renewal date the backend
 * does not already know.
 *
 * Deliberately NOT computed here:
 * - "progresso" when `lesson_count` is null (a cycle without a planned lesson
 *   count has no honest denominator — the row shows no bar at all).
 * - any renewal side effect. `renewalTarget` only produces a *link* into the
 *   flow that already exists; clicking it mutates nothing.
 */

import type { Appointment, Cycle, Receivable } from "@/lib/api";
import type { BadgeTone } from "@/components/ui/badge";
import { cycleBucket, cycleListStatus, cycleListStatusTone } from "@/lib/cycle-period";

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
  /** A renewal the client already asked for through the portal. */
  hasOpenRenewalRequest: boolean;
  /** Another cycle of the same client+service that starts at or after this one ends. */
  hasSuccessor: boolean;
  alerts: CycleAlert[];
  progress: { done: number; total: number } | null;
};

function isPending(r: Receivable): boolean {
  return r.status === "pending" || r.status === "expected";
}

function isOverdue(r: Receivable, today: string): boolean {
  return isPending(r) && r.due_on < today;
}

/**
 * True when another cycle for the same client and service picks up at or after
 * this one's end — i.e. it was already renewed, so no renewal alert is due.
 * Mirrors the backend's own suppression rule in
 * `domain.cycles_suppressed_from_home_attention` (renewed cycles stop nagging).
 */
function findSuccessor(cycle: Cycle, all: Cycle[]): boolean {
  return all.some(
    (other) =>
      other.id !== cycle.id &&
      other.client_id === cycle.client_id &&
      other.service_id === cycle.service_id &&
      other.status !== "cancelled" &&
      other.starts_on >= cycle.starts_on &&
      other.ends_on > cycle.ends_on,
  );
}

export function buildCycleRow(
  cycle: Cycle,
  opts: {
    allCycles: Cycle[];
    receivables: Receivable[];
    nextAppointmentByClientId: Record<string, Appointment>;
    openRenewalCycleIds: Set<string>;
    today: string;
  },
): CycleRow {
  const { allCycles, receivables, nextAppointmentByClientId, openRenewalCycleIds, today } = opts;

  const mine = receivables.filter((r) => r.cycle_id === cycle.id);
  const pending = mine.filter(isPending);
  const overdue = mine.filter((r) => isOverdue(r, today));
  const bucket = cycleBucket(cycle, today);
  const hasSuccessor = findSuccessor(cycle, allCycles);
  const hasOpenRenewalRequest = openRenewalCycleIds.has(cycle.id);

  const alerts: CycleAlert[] = [];
  if (cycle.status !== "cancelled") {
    if (!hasSuccessor && (cycle.is_nearing_end || bucket === "ended")) {
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
    hasOpenRenewalRequest,
    hasSuccessor,
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
  if (row.hasOpenRenewalRequest) return "/app/renewals";
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

/** Only cycles that could actually be renewed: not cancelled, not already
 * succeeded by another cycle, and either ending soon or already over. */
export function isRenewalEligible(row: CycleRow): boolean {
  if (row.cycle.status === "cancelled") return false;
  if (row.hasSuccessor) return false;
  return row.alerts.includes("renewal");
}
