/**
 * Legacy support helpers — do not surface e-mail or mailto in the product UI.
 * Feedback is submitted via POST /api/v1/feedback.
 */
export const SUPPORT_EMAIL = "";

/** @deprecated Prefer in-app /app/help. Kept only to avoid broken imports during migration. */
export function supportMailto(_subject = "Croniu — feedback / ajuda") {
  return "/app/help";
}
