import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("gtm", () => {
  beforeEach(() => {
    vi.resetModules();
    window.dataLayer = undefined;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("isGtmScriptAllowed", () => {
    it("is disabled without NEXT_PUBLIC_GTM_ID even in production and not HML", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("NEXT_PUBLIC_GTM_ID", "");
      const { isGtmScriptAllowed } = await import("./gtm");
      expect(isGtmScriptAllowed(false)).toBe(false);
    });

    it("is disabled on HML even with the id set and NODE_ENV=production — HML/PRD share one built image", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("NEXT_PUBLIC_GTM_ID", "GTM-NVQ74CPL");
      const { isGtmScriptAllowed } = await import("./gtm");
      expect(isGtmScriptAllowed(true)).toBe(false);
    });

    it("is disabled outside production even with an id configured and not HML", async () => {
      vi.stubEnv("NODE_ENV", "test");
      vi.stubEnv("NEXT_PUBLIC_GTM_ID", "GTM-NVQ74CPL");
      const { isGtmScriptAllowed } = await import("./gtm");
      expect(isGtmScriptAllowed(false)).toBe(false);
    });

    it("is enabled only when the id is set, NODE_ENV is production, and the request is not HML", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("NEXT_PUBLIC_GTM_ID", "GTM-NVQ74CPL");
      const { isGtmScriptAllowed } = await import("./gtm");
      expect(isGtmScriptAllowed(false)).toBe(true);
    });
  });

  describe("trackPageView / trackSignUp", () => {
    it("pushes to window.dataLayer regardless of environment — HML must stay inspectable without ever loading the container", async () => {
      vi.stubEnv("NODE_ENV", "test");
      vi.stubEnv("NEXT_PUBLIC_GTM_ID", "");
      const { trackPageView } = await import("./gtm");
      trackPageView({
        page_location: "https://croniu-hml.ntws.cloud/register",
        page_path: "/register",
        page_title: "Criar conta",
      });
      expect(window.dataLayer).toEqual([
        {
          event: "page_view",
          page_location: "https://croniu-hml.ntws.cloud/register",
          page_path: "/register",
          page_title: "Criar conta",
        },
      ]);
    });

    it("pushes exactly the documented shape for page_view including an optional referrer", async () => {
      const { trackPageView } = await import("./gtm");
      trackPageView({
        page_location: "https://app.croniu.com.br/app",
        page_path: "/app",
        page_title: "Início",
        page_referrer: "https://croniu.com.br/",
      });
      expect(window.dataLayer).toEqual([
        {
          event: "page_view",
          page_location: "https://app.croniu.com.br/app",
          page_path: "/app",
          page_title: "Início",
          page_referrer: "https://croniu.com.br/",
        },
      ]);
    });

    it("pushes sign_up with the method and only the tracked UTM/gclid params passed in", async () => {
      const { trackSignUp } = await import("./gtm");
      trackSignUp({ method: "email", utm_source: "instagram", utm_campaign: "lancamento" });
      expect(window.dataLayer).toEqual([
        { event: "sign_up", method: "email", utm_source: "instagram", utm_campaign: "lancamento" },
      ]);
    });

    it("pushes sign_up with method=google and no UTM fields when none were present", async () => {
      const { trackSignUp } = await import("./gtm");
      trackSignUp({ method: "google" });
      expect(window.dataLayer).toEqual([{ event: "sign_up", method: "google" }]);
    });

    it("never includes free-form text or PII fields in sign_up", async () => {
      const { trackSignUp } = await import("./gtm");
      trackSignUp({ method: "email" });
      const pushed = window.dataLayer?.[0] as Record<string, unknown>;
      expect(Object.keys(pushed)).toEqual(["event", "method"]);
    });
  });
});
