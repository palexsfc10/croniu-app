/**
 * sessionStorage flag set by EvaluationEditor right before it redirects back
 * to `returnTo` after a direct-entry publish (e.g. from the "Realizar
 * avaliação" card on /app) — read once by the destination screen to show a
 * brief success confirmation, same pattern as SETUP_CELEBRATE_KEY in
 * lib/setup-copy.ts.
 */
export const EVALUATION_SAVED_KEY = "croniu.evaluation-saved-celebrate";
