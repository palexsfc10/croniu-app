/**
 * Shared urgency tiers for the Home "Precisa de decisão" queue — mirrors the
 * backend's RANK_* constants in `app/services/domain.py`. Home's own
 * attention items already carry `priority_rank` from the API; this module
 * only supplies the matching numbers for the two sources that are fetched
 * separately by `today-board.tsx` (accompaniment, routines) so the client-side
 * merge can sort by rank instead of re-deriving urgency itself.
 */
export const ATTENTION_PRIORITY_RANK = {
  overduePayment: 0,
  renewalOverdue: 1,
  clientRequest: 2,
  overdueRoutineOrEvaluation: 3,
  renewalNearing: 4,
  paymentDueSoon: 5,
  appointmentSecondary: 6,
} as const;
