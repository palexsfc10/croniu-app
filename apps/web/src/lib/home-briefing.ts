import type { AttentionItem, HomeSummary, PriorityAction } from "@/lib/api";

export type BriefingNextAppointment = {
  id: string;
  clientName: string | null;
  startsAt: string;
  serviceLabel: string | null;
};

export type BriefingOpportunity = {
  title: string;
  subtitle: string;
  href: string;
  kind: string;
  entity_id: string;
};

export type Briefing = {
  nextAppointment: BriefingNextAppointment | null;
  urgentCount: number;
  mainRisk: PriorityAction | null;
  opportunity: BriefingOpportunity | null;
  isClearDay: boolean;
};

/**
 * Deterministic, zero-LLM daily briefing. Every field is derived from data
 * the Home already has in hand (home/summary + optional accompaniment
 * count) — no extra request, no AI call.
 *
 * Ordering rule ("principal risco"): reuses `summary.priority_action`
 * as-is — the backend already picks the single most critical item via
 * `select_home_priority` (financial > renewal > cycle attention > plan
 * pendencies, in that documented order). We never re-rank client-side;
 * duplicating that priority logic here would be exactly the kind of
 * invented ordering the fatia explicitly forbids.
 *
 * "urgentCount" counts attention_items whose tone is danger/warning —
 * both are real, backend-assigned tones, never inferred here — plus
 * `extraItems` (accompaniment/routine pendencies, built client-side as
 * real AttentionItem-shaped rows by the Home). Those two pools are
 * merged into one `allItems` list *before* picking mainRisk/opportunity,
 * not just summed into the count — counting them in `urgentCount` while
 * only ever searching backend `attention_items` for "principal risco"/
 * "vale olhar" is exactly how the Home used to show "N itens urgentes"
 * right next to "Nenhuma pendência crítica agora": urgentCount saw the
 * accompaniment pendencies, the risk/opportunity search never did.
 */
export function buildBriefing(
  summary: HomeSummary,
  opts: { accompanimentPendingCount?: number; extraItems?: AttentionItem[] } = {},
): Briefing {
  const upcoming = summary.upcoming_appointments?.[0] ?? summary.today_appointments[0] ?? null;
  const nextAppointment: BriefingNextAppointment | null = upcoming
    ? {
        id: upcoming.id,
        clientName: upcoming.client_name,
        startsAt: upcoming.starts_at,
        serviceLabel: upcoming.service_name ?? upcoming.cycle_service_name,
      }
    : null;

  const items = summary.attention_items ?? [];
  const allItems = [...items, ...(opts.extraItems ?? [])];
  const urgentCount =
    allItems.filter((i) => i.tone === "danger" || i.tone === "warning").length +
    (opts.accompanimentPendingCount ?? 0);

  const mainRisk = summary.priority_action ?? null;

  // Opportunity: the first item (backend attention_item OR accompaniment/
  // routine pendency) that ISN'T the one already shown as the main risk —
  // real data, never invented. If nothing else is waiting, the day reads
  // as genuinely clear.
  const opportunityItem = allItems.find((i: AttentionItem) => i.entity_id !== mainRisk?.entity_id);
  const opportunity: BriefingOpportunity | null = opportunityItem
    ? {
        title: opportunityItem.title,
        subtitle: opportunityItem.subtitle,
        href: opportunityItem.href,
        kind: opportunityItem.kind,
        entity_id: opportunityItem.entity_id,
      }
    : null;

  const isClearDay = !mainRisk && !opportunity && urgentCount === 0 && !nextAppointment;

  return { nextAppointment, urgentCount, mainRisk, opportunity, isClearDay };
}

/** True only when there is real, positive evidence the org is brand new —
 * never inferred from a single missing field. Checks every count/list the
 * summary carries, not just appointments/payments/cycles, so an active
 * professional whose only pendency is e.g. a routine due today is never
 * misread as a first-time account. */
export function isNewProfessional(summary: HomeSummary): boolean {
  const anyCount =
    (summary.new_submissions_count ?? 0) +
    (summary.anamnesis_pending_count ?? 0) +
    (summary.evaluation_pending_count ?? 0) +
    (summary.protocol_pending_count ?? 0) +
    (summary.protocol_reviews_due_count ?? 0) +
    (summary.routines_due_today_count ?? 0) +
    (summary.feedbacks_due_count ?? 0) +
    (summary.plans_ending_count ?? 0);
  return (
    !summary.has_active_service &&
    !summary.has_active_cycle_template &&
    summary.today_appointments.length === 0 &&
    (summary.attention_items ?? []).length === 0 &&
    summary.pending_payments.length === 0 &&
    summary.cycles_nearing_end.length === 0 &&
    (summary.cycles_ended_unrenewed ?? []).length === 0 &&
    anyCount === 0
  );
}
