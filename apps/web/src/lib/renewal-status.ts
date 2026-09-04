import type { BadgeTone } from "@/components/ui/badge";
import type { RenewalCaseView } from "@/lib/api";

/** Real business states for a renewal — distinct from a cycle's own status
 * (programado/em andamento/encerrado/cancelado). "overdue" is never a
 * persisted value: the backend derives it from the cycle having actually
 * ended while the case is still open. */
export function renewalStatusLabel(status: RenewalCaseView["display_status"]): string {
  switch (status) {
    case "upcoming":
      return "Renovação próxima";
    case "pending":
      return "Decisão pendente";
    case "awaiting_client":
      return "Aguardando cliente";
    case "overdue":
      return "Renovação atrasada";
    case "renewed":
      return "Renovada";
    case "ended_without_renewal":
      return "Encerrada sem renovação";
    default:
      return status;
  }
}

export function renewalStatusTone(status: RenewalCaseView["display_status"]): BadgeTone {
  switch (status) {
    case "upcoming":
      return "info";
    case "pending":
      return "warning";
    case "awaiting_client":
      return "info";
    case "overdue":
      return "danger";
    case "renewed":
      return "success";
    case "ended_without_renewal":
      return "neutral";
    default:
      return "neutral";
  }
}

export const RESOLUTION_REASON_LABEL: Record<
  NonNullable<RenewalCaseView["resolution_reason"]>,
  string
> = {
  client_declined: "Cliente recusou",
  no_response: "Sem resposta",
  service_ended: "Serviço encerrado",
  other: "Outro",
};

export const RESOLUTION_REASON_OPTIONS = (
  Object.keys(RESOLUTION_REASON_LABEL) as Array<NonNullable<RenewalCaseView["resolution_reason"]>>
).map((value) => ({ value, label: RESOLUTION_REASON_LABEL[value] }));

/** Whichever case is more urgent sorts first: overdue > awaiting client >
 * decision pending > upcoming > resolved (renewed/ended), and within a tier,
 * a real portal request from the client always outranks a silent one. */
const ORDER: Record<RenewalCaseView["display_status"], number> = {
  overdue: 0,
  awaiting_client: 1,
  pending: 2,
  upcoming: 3,
  renewed: 4,
  ended_without_renewal: 5,
};

export function sortRenewalCases(rows: RenewalCaseView[]): RenewalCaseView[] {
  return [...rows].sort((a, b) => {
    const orderDiff = ORDER[a.display_status] - ORDER[b.display_status];
    if (orderDiff !== 0) return orderDiff;
    if (a.portal_requested !== b.portal_requested) return a.portal_requested ? -1 : 1;
    return a.ends_on.localeCompare(b.ends_on);
  });
}

export function isNeedsDecisionStatus(status: RenewalCaseView["display_status"]): boolean {
  return status !== "renewed" && status !== "ended_without_renewal";
}

/**
 * Single lookup structure every screen must share instead of re-deriving
 * renewal state on its own — keyed by `source_cycle_id`, the cycle whose
 * renewal process the case tracks. `RenewalCase` is the source of truth
 * whenever a row exists for a cycle; a cycle with no entry here simply has no
 * renewal process yet (e.g. it isn't near its end).
 */
export type RenewalCaseIndex = Map<string, RenewalCaseView>;

export function buildRenewalCaseIndex(rows: RenewalCaseView[]): RenewalCaseIndex {
  const index: RenewalCaseIndex = new Map();
  for (const row of rows) {
    index.set(row.source_cycle_id, row);
  }
  return index;
}

export function cycleRenewalCase(
  cycleId: string | null | undefined,
  index: RenewalCaseIndex,
): RenewalCaseView | null {
  if (!cycleId) return null;
  return index.get(cycleId) ?? null;
}
