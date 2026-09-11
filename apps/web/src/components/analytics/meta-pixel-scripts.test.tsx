import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";

let pathname = "/";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

async function loadScripts() {
  const { MetaPixelScripts } = await import("./meta-pixel-scripts");
  return MetaPixelScripts;
}

function grantConsent() {
  window.localStorage.setItem("croniu_app_consent_v1", JSON.stringify({ analytics: true, marketing: true }));
}

describe("MetaPixelScripts", () => {
  beforeEach(() => {
    vi.resetModules();
    window.localStorage.clear();
    pathname = "/";
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    // next/script tracks "already inserted" ids in a cache that outlives
    // vi.resetModules() and DOM removal (see croniu-site's identical note) —
    // without removing the node too, a later test asserting on this same id
    // would see a previous test's stale element instead of its own render.
    document.querySelectorAll('script[id="meta-pixel"]').forEach((el) => el.remove());
  });

  it("never renders on HML, even on /register with consent granted", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID", "1560028922592261");
    grantConsent();
    pathname = "/register";
    const MetaPixelScripts = await loadScripts();
    render(<MetaPixelScripts isHml={true} />);
    expect(document.querySelectorAll('script[id="meta-pixel"]')).toHaveLength(0);
  });

  it("never renders without marketing consent", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID", "1560028922592261");
    pathname = "/register";
    const MetaPixelScripts = await loadScripts();
    render(<MetaPixelScripts isHml={false} />);
    expect(document.querySelectorAll('script[id="meta-pixel"]')).toHaveLength(0);
  });

  it("never renders on a sensitive token route even with consent granted", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID", "1560028922592261");
    grantConsent();
    pathname = "/c/some-token";
    const MetaPixelScripts = await loadScripts();
    render(<MetaPixelScripts isHml={false} />);
    expect(document.querySelectorAll('script[id="meta-pixel"]')).toHaveLength(0);
  });

  // next/script's cross-test id dedup cache (see the afterEach comment)
  // means only ONE test in this file may actually render the real
  // id="meta-pixel" tag with content assertions — the pathname-dependent
  // branch (StartRegistration on /register vs. plain PageView elsewhere) is
  // a pure function (metaPixelTrackCalls) tested directly, with no such
  // constraint, in meta-pixel.test.ts.
  it("reacts to a consent grant with no reload, installing the pixel with PageView + StartRegistration on /register", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID", "1560028922592261");
    pathname = "/register";
    const { storeConsent } = await import("@/lib/analytics/consent");
    const MetaPixelScripts = await loadScripts();
    render(<MetaPixelScripts isHml={false} />);
    expect(document.querySelectorAll('script[id="meta-pixel"]')).toHaveLength(0);

    storeConsent({ analytics: false, marketing: true });

    await waitFor(() => {
      expect(document.querySelectorAll('script[id="meta-pixel"]')).toHaveLength(1);
    });
    const text = document.querySelector('script[id="meta-pixel"]')?.textContent ?? "";
    expect(text).toContain("fbq('init', '1560028922592261');");
    expect(text).toContain("fbq('track', 'PageView');\nfbq('trackCustom', 'StartRegistration');");
    expect(text).not.toContain("fbq('trackCustom', 'PageView')");
  });
});
