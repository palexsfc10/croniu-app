import type { Appointment, Client, Cycle, Receivable } from "@/lib/api";
import { cycleBucket } from "@/lib/cycle-period";
import { formatPhoneBR } from "@/lib/status-labels";

export type ClientListBadge =
  | { tone: "neutral"; label: string }
  | { tone: "warning"; label: string }
  | { tone: "muted"; label: string };

export function clientInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function clientListPresentation(
  client: Client,
  cycles: Cycle[],
  today: string,
  terms: { session: string; accompaniment: string },
): { subtitle: string; badge: ClientListBadge } {
  if (client.status === "archived") {
    return { subtitle: formatPhoneBR(client.phone) === "—" ? "Arquivado" : formatPhoneBR(client.phone), badge: { tone: "muted", label: "Arquivado" } };
  }
  const mine = cycles.filter((c) => c.client_id === client.id);
  const current = mine.find((c) => cycleBucket(c, today) === "active");
  const upcoming = mine.find((c) => cycleBucket(c, today) === "upcoming");
  if (current) {
    const days = current.days_remaining;
    if (current.is_nearing_end && days != null) {
      return {
        subtitle: `Ciclo termina em ${days} ${days === 1 ? "dia" : "dias"}`,
        badge: { tone: "warning", label: "Precisa de atenção" },
      };
    }
    return {
      subtitle: `Ciclo em andamento`,
      badge: { tone: "neutral", label: "Ativo" },
    };
  }
  if (upcoming) {
    return {
      subtitle: `Aguardando início`,
      badge: { tone: "neutral", label: "Aguardando início" },
    };
  }
  return {
    subtitle: `${terms.accompaniment.charAt(0).toUpperCase()}${terms.accompaniment.slice(1)} ainda não preparado`,
    badge: { tone: "muted", label: "Sem ciclo" },
  };
}

// --- Rich list row (table/cards) -------------------------------------------

export type AttentionReason = "renewal" | "financial" | "onboarding" | "no_accompaniment";

export const ATTENTION_REASON_LABEL: Record<AttentionReason, string> = {
  renewal: "Renovação",
  financial: "Financeiro",
  onboarding: "Onboarding",
  no_accompaniment: "Sem acompanhamento",
};

export type ClientRow = {
  client: Client;
  activeCycle: Cycle | null;
  upcomingCycle: Cycle | null;
  nextAppointment: Appointment | null;
  pendingReceivablesCount: number;
  pendingReceivablesTotalCents: number;
  overdueReceivablesCount: number;
  hasPendingIntake: boolean;
  reasons: AttentionReason[];
};

function isReceivableOverdue(r: Receivable, today: string): boolean {
  return (r.status === "pending" || r.status === "expected") && r.due_on < today;
}

function isReceivablePending(r: Receivable): boolean {
  return r.status === "pending" || r.status === "expected";
}

/**
 * Builds the per-client row the list (table + mobile cards) renders from,
 * combining data already fetched in bulk (clients, cycles, receivables,
 * next-appointments, pending intake submissions) — never a per-row API call.
 */
export function buildClientRow(
  client: Client,
  opts: {
    cycles: Cycle[];
    receivables: Receivable[];
    nextAppointmentByClientId: Record<string, Appointment>;
    pendingIntakeClientIds: Set<string>;
    today: string;
  },
): ClientRow {
  const { cycles, receivables, nextAppointmentByClientId, pendingIntakeClientIds, today } = opts;
  const mine = cycles.filter((c) => c.client_id === client.id);
  const activeCycle = mine.find((c) => cycleBucket(c, today) === "active") ?? null;
  const upcomingCycle = mine.find((c) => cycleBucket(c, today) === "upcoming") ?? null;
  const nextAppointment = nextAppointmentByClientId[client.id] ?? null;

  const myReceivables = receivables.filter((r) => r.client_id === client.id);
  const pending = myReceivables.filter(isReceivablePending);
  const overdue = myReceivables.filter((r) => isReceivableOverdue(r, today));
  const pendingReceivablesTotalCents = pending.reduce((sum, r) => sum + r.amount_cents, 0);

  const hasPendingIntake = pendingIntakeClientIds.has(client.id);
  const hasAnyCycleEver = mine.length > 0;

  const reasons: AttentionReason[] = [];
  if (client.status === "active") {
    if ((activeCycle?.is_nearing_end && !upcomingCycle) || (!activeCycle && !upcomingCycle && hasAnyCycleEver)) {
      reasons.push("renewal");
    }
    if (overdue.length > 0) reasons.push("financial");
    if (hasPendingIntake || !hasAnyCycleEver) reasons.push("onboarding");
    else if (!activeCycle && !upcomingCycle) reasons.push("no_accompaniment");
  }

  return {
    client,
    activeCycle,
    upcomingCycle,
    nextAppointment,
    pendingReceivablesCount: pending.length,
    pendingReceivablesTotalCents,
    overdueReceivablesCount: overdue.length,
    hasPendingIntake,
    reasons,
  };
}

export type ClientListView = "all" | "attention" | "onboarding" | "renewal" | "financial" | "no_accompaniment";

export function matchesView(row: ClientRow, view: ClientListView): boolean {
  if (view === "all") return true;
  if (view === "attention") return row.reasons.length > 0;
  return row.reasons.includes(view);
}
