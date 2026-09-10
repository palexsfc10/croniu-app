/**
 * App-scoped consent store — same category model and default-denied
 * philosophy as croniu-site's `src/lib/analytics/consent.ts`, but its own
 * `localStorage` key. Consent choices don't cross the croniu.com.br →
 * app.croniu.com.br hop automatically (separate origins, separate
 * `localStorage`), so the app asks again on first visit rather than assuming
 * a decision made on the marketing site — this *is* "respecting existing
 * consent": never granting analytics/marketing storage here without an
 * explicit choice made on this origin.
 */
export type ConsentChoice = { analytics: boolean; marketing: boolean };

const STORAGE_KEY = "croniu_app_consent_v1";

/** Dispatched on `window` whenever the stored choice changes — lets scripts gated on marketing consent (Meta Pixel) react without a page reload. */
export const CONSENT_UPDATED_EVENT = "croniu:app-consent-updated";

export function getStoredConsent(): ConsentChoice | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ConsentChoice>;
    if (typeof parsed.analytics === "boolean" && typeof parsed.marketing === "boolean") {
      return { analytics: parsed.analytics, marketing: parsed.marketing };
    }
    return null;
  } catch {
    return null;
  }
}

export function storeConsent(choice: ConsentChoice): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(choice));
  } catch {
    /* storage unavailable (private mode, quota) — consent still applied for this session */
  }
  window.dispatchEvent(new CustomEvent(CONSENT_UPDATED_EVENT, { detail: choice }));
}

function consentState(choice: ConsentChoice | null) {
  const marketing = choice?.marketing ? "granted" : "denied";
  return {
    ad_storage: marketing,
    ad_user_data: marketing,
    ad_personalization: marketing,
    analytics_storage: choice?.analytics ? "granted" : "denied",
  } as const;
}

/** Must run before the GTM container script executes — see the beforeInteractive script in gtm-scripts.tsx. */
export function pushDefaultConsent(choice: ConsentChoice | null): void {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(["consent", "default", { ...consentState(choice), wait_for_update: 500 }]);
}

export function pushConsentUpdate(choice: ConsentChoice): void {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(["consent", "update", consentState(choice)]);
}
