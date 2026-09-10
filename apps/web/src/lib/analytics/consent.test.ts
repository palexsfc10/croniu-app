import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONSENT_UPDATED_EVENT,
  getStoredConsent,
  pushConsentUpdate,
  pushDefaultConsent,
  storeConsent,
} from "./consent";

describe("consent", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.dataLayer = undefined;
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("has no stored choice before the visitor decides", () => {
    expect(getStoredConsent()).toBeNull();
  });

  it("round-trips a stored choice", () => {
    storeConsent({ analytics: true, marketing: false });
    expect(getStoredConsent()).toEqual({ analytics: true, marketing: false });
  });

  it("ignores malformed stored JSON instead of throwing", () => {
    window.localStorage.setItem("croniu_app_consent_v1", "{not json");
    expect(getStoredConsent()).toBeNull();
  });

  it("dispatches CONSENT_UPDATED_EVENT with the new choice whenever it is stored", () => {
    const handler = vi.fn();
    window.addEventListener(CONSENT_UPDATED_EVENT, handler);
    storeConsent({ analytics: true, marketing: true });
    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener(CONSENT_UPDATED_EVENT, handler);
  });

  it("pushes denied-by-default consent state when there is no stored choice", () => {
    pushDefaultConsent(null);
    expect(window.dataLayer).toEqual([
      [
        "consent",
        "default",
        {
          ad_storage: "denied",
          ad_user_data: "denied",
          ad_personalization: "denied",
          analytics_storage: "denied",
          wait_for_update: 500,
        },
      ],
    ]);
  });

  it("maps a stored choice to granted/denied consent signals", () => {
    pushDefaultConsent({ analytics: true, marketing: false });
    expect(window.dataLayer).toEqual([
      [
        "consent",
        "default",
        {
          ad_storage: "denied",
          ad_user_data: "denied",
          ad_personalization: "denied",
          analytics_storage: "granted",
          wait_for_update: 500,
        },
      ],
    ]);
  });

  it("pushes a consent update with no wait_for_update", () => {
    pushConsentUpdate({ analytics: true, marketing: true });
    expect(window.dataLayer).toEqual([
      [
        "consent",
        "update",
        {
          ad_storage: "granted",
          ad_user_data: "granted",
          ad_personalization: "granted",
          analytics_storage: "granted",
        },
      ],
    ]);
  });
});
