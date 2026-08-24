import type { BadgeTone } from "@/components/ui/badge";

const DANGER_HINTS = ["disabled", "suspended", "blocked", "expired", "past_due", "cancel", "failed", "critical"];
const WARNING_HINTS = ["trial", "evaluating", "pending", "divergent", "review"];
const SUCCESS_HINTS = ["active", "confirmed", "resolved", "intact", "ok"];

export function statusTone(status: string | null | undefined): BadgeTone {
  const value = (status ?? "").toLowerCase();
  if (!value) return "neutral";
  if (DANGER_HINTS.some((hint) => value.includes(hint))) return "danger";
  if (WARNING_HINTS.some((hint) => value.includes(hint))) return "warning";
  if (SUCCESS_HINTS.some((hint) => value.includes(hint))) return "success";
  return "neutral";
}
