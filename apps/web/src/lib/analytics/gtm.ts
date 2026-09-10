/**
 * Central dataLayer gateway. Every GA4 event in the app must go through one
 * of the typed helpers below — never push to `window.dataLayer` from a
 * component directly. GA4 itself is configured as a tag *inside* Google Tag
 * Manager (GTM-NVQ74CPL, same container as croniu.com.br), not installed
 * directly — this file never loads gtag.js.
 *
 * Unlike the institutional site's `gtm.ts` (croniu-site), pushes here are
 * NOT gated on the container being allowed to load. HML and PRD currently
 * share one built image (see apps/web/Dockerfile /
 * .github/workflows/build-release.yml), so `NEXT_PUBLIC_GTM_ID` is baked
 * into both the same way — the only thing that may ever stop the container
 * from loading on a given request is `isGtmScriptAllowed()` below, which is
 * host/CRONIU_ENV-gated (see apps/web/src/app/layout.tsx). Pushing
 * unconditionally means `window.dataLayer` is always inspectable in HML's
 * devtools for manual validation, with zero risk of contaminating the
 * production GA4 property: nothing is ever sent to Google unless the
 * container script itself was allowed to load.
 */

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

export const GTM_ID = (process.env.NEXT_PUBLIC_GTM_ID ?? "").trim();

/**
 * Whether the GTM container script is allowed to load. `isHml` comes from
 * `CRONIU_ENV === "hml"` (see apps/web/src/app/layout.tsx) and is threaded
 * down as a prop — deliberately not the request Host header, which would
 * force the whole app out of static rendering (see the comment in
 * layout.tsx). `GtmContainerScript`'s own snippet re-checks
 * `location.hostname` client-side as a second, independent layer.
 */
export function isGtmScriptAllowed(isHml: boolean): boolean {
  return Boolean(GTM_ID) && process.env.NODE_ENV === "production" && !isHml;
}

function push(payload: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(payload);
}

export type PageViewParams = {
  page_location: string;
  page_path: string;
  page_title: string;
  page_referrer?: string;
};
export function trackPageView(params: PageViewParams): void {
  push({ event: "page_view", ...params });
}

export type SignUpMethod = "email" | "google";
export type SignUpParams = {
  method: SignUpMethod;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  gclid?: string;
};
/** Fire only after the backend has confirmed the account was actually created. */
export function trackSignUp(params: SignUpParams): void {
  push({ event: "sign_up", ...params });
}
