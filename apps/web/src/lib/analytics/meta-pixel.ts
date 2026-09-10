/**
 * Meta Pixel — separate from the GTM/GA4 container above (Meta has no
 * server-side tag manager here), so it gets its own small gateway. Unlike
 * GA4 (which loads unconditionally and lets Consent Mode block the actual
 * send), Meta's snippet has no equivalent consent-signal integration, so the
 * whole script is gated behind explicit "marketing" consent, not just
 * env/host — see `isMetaPixelScriptAllowed`.
 */

declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & { queue?: unknown[] };
  }
}

export const META_PIXEL_ID = (process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "").trim();

/**
 * Env/host portion of the gate only — `isHml` is the same server-computed
 * signal used for `isGtmScriptAllowed`. HML and PRD share one built image,
 * so this is the only thing keeping HML traffic out of the production
 * Pixel/Ads account. Exposed separately (not folded into
 * `isMetaPixelScriptAllowed`) so the consent banner can ask "could this ever
 * load here" without first needing an actual consent decision to check
 * against.
 */
export function isMetaPixelEnvAllowed(isHml: boolean): boolean {
  return Boolean(META_PIXEL_ID) && process.env.NODE_ENV === "production" && !isHml;
}

/**
 * Full gate: env/host allowed AND the visitor has explicitly opted into the
 * "marketing" consent category on this origin (see consent.ts) — the script
 * is not injected at all otherwise.
 */
export function isMetaPixelScriptAllowed(isHml: boolean, hasMarketingConsent: boolean): boolean {
  return isMetaPixelEnvAllowed(isHml) && hasMarketingConsent;
}

/** Fire only after the backend has confirmed the account was actually created — mirrors trackSignUp in gtm.ts. */
export function trackPixelCompleteRegistration(): void {
  if (typeof window === "undefined" || typeof window.fbq !== "function") return;
  window.fbq("track", "CompleteRegistration");
}
