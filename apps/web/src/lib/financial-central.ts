/**
 * Row/bucket derivation for the Financeiro central. Every number here comes
 * straight from real `Receivable` rows — never Croniu's own subscription
 * billing, never a projection. A R$0,00 (free-cycle) receivable is never
 * "pending" here — see `isReceivablePending` in `client-list.ts`, the single
 * shared definition every screen in the app now uses.
 */

import type { Receivable } from "@/lib/api";
import { isReceivableOverdue, isReceivablePending } from "@/lib/client-list";

export type ReceivableView = "all" | "overdue" | "upcoming" | "pending" | "received" | "cancelled";

const UPCOMING_WINDOW_DAYS = 7;

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/** "Vencendo": pending, real value, due within the next 7 days (today
 * included) but not yet overdue. A distinct, narrower bucket than "pending"
 * so the professional can tell "act now" apart from "will need to act soon". */
export function isReceivableUpcoming(r: Receivable, today: string): boolean {
  if (!isReceivablePending(r)) return false;
  const limit = addDays(today, UPCOMING_WINDOW_DAYS);
  return r.due_on >= today && r.due_on <= limit;
}

export function matchesReceivableView(r: Receivable, view: ReceivableView, today: string): boolean {
  if (view === "all") return true;
  if (view === "overdue") return isReceivableOverdue(r, today);
  if (view === "upcoming") return isReceivableUpcoming(r, today);
  if (view === "pending") return isReceivablePending(r);
  if (view === "received") return r.status === "received";
  if (view === "cancelled") return r.status === "cancelled";
  return true;
}

export function receivableActionLabel(r: Receivable): string {
  if (r.status === "pending" && r.amount_cents > 0) return "Registrar pagamento";
  if (r.status === "received") return "Ver recebimento";
  return "Ver";
}
