import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

async function loadBanner() {
  const { ConsentBanner, OPEN_CONSENT_PREFERENCES_EVENT } = await import("./consent-banner");
  return { ConsentBanner, OPEN_CONSENT_PREFERENCES_EVENT };
}

describe("ConsentBanner", () => {
  beforeEach(() => {
    vi.resetModules();
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  it("never renders on HML even when the ids are set — nothing could ever load there", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_GTM_ID", "GTM-NVQ74CPL");
    const { ConsentBanner } = await loadBanner();
    render(<ConsentBanner isHml={true} />);
    expect(screen.queryByRole("dialog", { name: "Preferências de cookies" })).not.toBeInTheDocument();
  });

  it("never renders without any configured id", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_GTM_ID", "");
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID", "");
    const { ConsentBanner } = await loadBanner();
    render(<ConsentBanner isHml={false} />);
    expect(screen.queryByRole("dialog", { name: "Preferências de cookies" })).not.toBeInTheDocument();
  });

  it("shows the banner on first visit when GTM is enabled, not HML, and no choice was stored", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_GTM_ID", "GTM-NVQ74CPL");
    const { ConsentBanner } = await loadBanner();
    render(<ConsentBanner isHml={false} />);
    expect(await screen.findByRole("dialog", { name: "Preferências de cookies" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aceitar todos" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recusar opcionais" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Configurar" })).toBeInTheDocument();
  });

  it("does not show the banner again once a choice was already stored", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_GTM_ID", "GTM-NVQ74CPL");
    window.localStorage.setItem(
      "croniu_app_consent_v1",
      JSON.stringify({ analytics: true, marketing: false }),
    );
    const { ConsentBanner } = await loadBanner();
    render(<ConsentBanner isHml={false} />);
    expect(screen.queryByRole("dialog", { name: "Preferências de cookies" })).not.toBeInTheDocument();
  });

  it("does not pre-check optional categories in the expanded view", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_GTM_ID", "GTM-NVQ74CPL");
    const user = userEvent.setup();
    const { ConsentBanner } = await loadBanner();
    render(<ConsentBanner isHml={false} />);
    await user.click(await screen.findByRole("button", { name: "Configurar" }));
    expect(screen.getByRole("checkbox", { name: /Analytics/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Marketing/ })).not.toBeChecked();
  });

  it('"Recusar opcionais" stores every category denied', async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_GTM_ID", "GTM-NVQ74CPL");
    window.dataLayer = undefined;
    const user = userEvent.setup();
    const { ConsentBanner } = await loadBanner();
    render(<ConsentBanner isHml={false} />);
    await user.click(await screen.findByRole("button", { name: "Recusar opcionais" }));

    expect(JSON.parse(window.localStorage.getItem("croniu_app_consent_v1") ?? "null")).toEqual({
      analytics: false,
      marketing: false,
    });
    expect(window.dataLayer).toContainEqual([
      "consent",
      "update",
      {
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
        analytics_storage: "denied",
      },
    ]);
  });

  it('"Aceitar todos" stores every category granted', async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_GTM_ID", "GTM-NVQ74CPL");
    window.dataLayer = undefined;
    const user = userEvent.setup();
    const { ConsentBanner } = await loadBanner();
    render(<ConsentBanner isHml={false} />);
    await user.click(await screen.findByRole("button", { name: "Aceitar todos" }));

    expect(JSON.parse(window.localStorage.getItem("croniu_app_consent_v1") ?? "null")).toEqual({
      analytics: true,
      marketing: true,
    });
  });

  it("reopens from the settings preferences event and restores the stored choice", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_GTM_ID", "GTM-NVQ74CPL");
    window.localStorage.setItem(
      "croniu_app_consent_v1",
      JSON.stringify({ analytics: true, marketing: false }),
    );
    const { ConsentBanner, OPEN_CONSENT_PREFERENCES_EVENT } = await loadBanner();
    render(<ConsentBanner isHml={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    window.dispatchEvent(new CustomEvent(OPEN_CONSENT_PREFERENCES_EVENT));

    expect(await screen.findByRole("dialog", { name: "Preferências de cookies" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Analytics/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Marketing/ })).not.toBeChecked();
  });
});
