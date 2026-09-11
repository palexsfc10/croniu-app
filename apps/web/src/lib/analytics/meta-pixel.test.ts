import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("meta-pixel", () => {
  beforeEach(() => {
    vi.resetModules();
    window.fbq = undefined;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("isMetaPixelEnvAllowed", () => {
    it("is disabled without NEXT_PUBLIC_META_PIXEL_ID", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID", "");
      const { isMetaPixelEnvAllowed } = await import("./meta-pixel");
      expect(isMetaPixelEnvAllowed(false)).toBe(false);
    });

    it("is disabled on HML even with the id set — HML/PRD share one built image", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID", "1560028922592261");
      const { isMetaPixelEnvAllowed } = await import("./meta-pixel");
      expect(isMetaPixelEnvAllowed(true)).toBe(false);
    });

    it("is enabled when the id is set, NODE_ENV is production, and not HML", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID", "1560028922592261");
      const { isMetaPixelEnvAllowed } = await import("./meta-pixel");
      expect(isMetaPixelEnvAllowed(false)).toBe(true);
    });
  });

  describe("isMetaPixelScriptAllowed", () => {
    it("additionally requires marketing consent even when env/host allow it", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID", "1560028922592261");
      const { isMetaPixelScriptAllowed } = await import("./meta-pixel");
      expect(isMetaPixelScriptAllowed(false, false)).toBe(false);
      expect(isMetaPixelScriptAllowed(false, true)).toBe(true);
    });
  });

  describe("trackPixelCompleteRegistration", () => {
    it("does nothing when the base snippet never loaded (window.fbq undefined)", async () => {
      const { trackPixelCompleteRegistration } = await import("./meta-pixel");
      expect(() => trackPixelCompleteRegistration()).not.toThrow();
    });

    it("calls fbq('track', 'CompleteRegistration') when the snippet is present", async () => {
      const fbq = vi.fn();
      window.fbq = fbq;
      const { trackPixelCompleteRegistration } = await import("./meta-pixel");
      trackPixelCompleteRegistration();
      expect(fbq).toHaveBeenCalledWith("track", "CompleteRegistration");
    });
  });

  describe("metaPixelTrackCalls", () => {
    it("fires only PageView on an ordinary route", async () => {
      const { metaPixelTrackCalls } = await import("./meta-pixel");
      expect(metaPixelTrackCalls("/app")).toBe("fbq('track', 'PageView');");
      expect(metaPixelTrackCalls("/login")).toBe("fbq('track', 'PageView');");
    });

    it("fires StartRegistration right after PageView, only on /register", async () => {
      const { metaPixelTrackCalls } = await import("./meta-pixel");
      expect(metaPixelTrackCalls("/register")).toBe(
        "fbq('track', 'PageView');\nfbq('trackCustom', 'StartRegistration');",
      );
    });

    it("uses trackCustom (never track) for StartRegistration — it is not a standard Meta event", async () => {
      const { metaPixelTrackCalls } = await import("./meta-pixel");
      expect(metaPixelTrackCalls("/register")).toContain("fbq('trackCustom', 'StartRegistration')");
      expect(metaPixelTrackCalls("/register")).not.toContain("fbq('track', 'StartRegistration')");
    });

    it("never uses trackCustom for PageView itself", async () => {
      const { metaPixelTrackCalls } = await import("./meta-pixel");
      expect(metaPixelTrackCalls("/register")).not.toContain("fbq('trackCustom', 'PageView')");
      expect(metaPixelTrackCalls("/app")).not.toContain("trackCustom");
    });
  });
});
