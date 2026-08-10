/** Domain → visual tone helpers. Color is never the only cue — callers must keep labels. */

import type { BadgeTone } from "@/components/ui/badge";

export function cycleStatusTone(status: string, isNearingEnd?: boolean): BadgeTone {
  if (status === "cancelled" || status === "ended" || status === "completed") return "neutral";
  if (isNearingEnd) return "warning";
  if (status === "active" || status === "paused") return status === "paused" ? "info" : "progress";
  return "neutral";
}

export function cycleStatusLabel(status: string, isNearingEnd?: boolean): string {
  if (status === "cancelled") return "Cancelado";
  if (status === "ended" || status === "completed") return "Encerrado";
  if (isNearingEnd) return "Termina em breve";
  if (status === "paused") return "Pausado";
  if (status === "active") return "Vigente";
  return status;
}

export function receivableStatusTone(status: string, overdue?: boolean): BadgeTone {
  if (status === "paid" || status === "received") return "success";
  if (status === "cancelled") return "neutral";
  if (overdue || status === "overdue" || status === "late") return "danger";
  if (status === "pending" || status === "open" || status === "awaiting") return "warning";
  return "neutral";
}

export function receivableStatusLabel(status: string, overdue?: boolean): string {
  if (status === "paid" || status === "received") return "Recebido";
  if (status === "cancelled") return "Cancelado";
  if (overdue || status === "overdue" || status === "late") return "Atrasado";
  if (status === "pending" || status === "open" || status === "awaiting") return "Pendente";
  return status;
}

export function appointmentStatusTone(status: string): BadgeTone {
  if (status === "completed" || status === "done") return "success";
  if (status === "no_show" || status === "cancelled") return "neutral";
  if (status === "in_progress") return "primary";
  if (status === "scheduled") return "info";
  return "neutral";
}
