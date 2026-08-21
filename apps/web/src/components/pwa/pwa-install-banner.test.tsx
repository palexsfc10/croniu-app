import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PwaInstallBanner } from "@/components/pwa/pwa-install-banner";
import {
  OFFICIAL_PWA_ICON_SRC,
  PWA_INSTALL_BANNER_DISMISS_KEY,
  PWA_INSTALL_DISMISS_MS,
  PWA_INSTALL_MARK_KEY,
  emitPwaInstallTelemetry,
  setDeferredInstallPrompt,
  subscribePwaInstallTelemetry,
  writeInstalledMark,
  type CroniuBeforeInstallPromptEvent,
} from "@/lib/pwa-install";

/** Mirrors what AppShell's always-mounted listener does with a real
 * `beforeinstallprompt` event: preventDefault, then store it in the shared
 * singleton the banner reads from. */
function capturePrompt(event: CroniuBeforeInstallPromptEvent) {
  event.preventDefault();
  setDeferredInstallPrompt(event);
}

/** Mirrors what AppShell's `appinstalled` listener does. */
function simulateAppInstalled() {
  setDeferredInstallPrompt(null);
  writeInstalledMark(localStorage);
  emitPwaInstallTelemetry("pwa_installed");
}

function mockMatchMedia(standalone = false) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn((query: string) => ({
      matches:
        (standalone && query.includes("display-mode: standalone")) ||
        (standalone && query.includes("display-mode: fullscreen")),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function setUa(ua: string, maxTouchPoints = 0) {
  Object.defineProperty(window.navigator, "userAgent", {
    configurable: true,
    get: () => ua,
  });
  Object.defineProperty(window.navigator, "maxTouchPoints", {
    configurable: true,
    get: () => maxTouchPoints,
  });
}

function makePromptEvent(outcome: "accepted" | "dismissed" = "accepted") {
  const prompt = vi.fn(async () => undefined);
  const event = new Event("beforeinstallprompt") as CroniuBeforeInstallPromptEvent;
  Object.assign(event, {
    prompt,
    userChoice: Promise.resolve({ outcome, platform: "web" }),
    preventDefault: vi.fn(),
  });
  return { event, prompt };
}

describe("PwaInstallBanner", () => {
  const events: string[] = [];
  let unsub: (() => void) | undefined;

  beforeEach(() => {
    events.length = 0;
    localStorage.clear();
    setDeferredInstallPrompt(null);
    mockMatchMedia(false);
    setUa("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0");
    unsub = subscribePwaInstallTelemetry((e) => events.push(e));
  });

  afterEach(() => {
    unsub?.();
    cleanup();
    vi.restoreAllMocks();
  });

  it("does not render without support outside eligible iOS", () => {
    render(<PwaInstallBanner />);
    expect(screen.queryByTestId("pwa-install-banner")).toBeNull();
    expect(screen.queryByRole("button", { name: "Instalar" })).toBeNull();
  });

  it("captures beforeinstallprompt and shows banner with official icon", async () => {
    render(<PwaInstallBanner />);
    const { event } = makePromptEvent();
    capturePrompt(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(await screen.findByTestId("pwa-install-banner")).toBeTruthy();
    const img = screen.getByRole("presentation", { hidden: true }) as HTMLImageElement | null;
    const anyImg = document.querySelector(`img[src="${OFFICIAL_PWA_ICON_SRC}"]`);
    expect(anyImg).toBeTruthy();
    expect(img || anyImg).toBeTruthy();
    expect(screen.getByRole("button", { name: "Instalar" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Dispensar convite de instalação" }),
    ).toBeTruthy();
    await waitFor(() => expect(events).toContain("pwa_install_banner_shown"));
  });

  it("calls prompt() once on install click and hides on accept", async () => {
    render(<PwaInstallBanner />);
    const { event, prompt } = makePromptEvent("accepted");
    capturePrompt(event);
    const btn = await screen.findByRole("button", { name: "Instalar" });
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(prompt).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByTestId("pwa-install-banner")).toBeNull());
    expect(events).toContain("pwa_install_clicked");
    expect(events).toContain("pwa_install_accepted");
  });

  it("does not loop when native prompt is dismissed", async () => {
    render(<PwaInstallBanner />);
    const { event, prompt } = makePromptEvent("dismissed");
    capturePrompt(event);
    fireEvent.click(await screen.findByRole("button", { name: "Instalar" }));
    await waitFor(() => expect(prompt).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByTestId("pwa-install-banner")).toBeNull());
    // Without a new beforeinstallprompt, banner stays hidden.
    expect(screen.queryByTestId("pwa-install-banner")).toBeNull();
  });

  it("hides permanently after appinstalled", async () => {
    render(<PwaInstallBanner />);
    capturePrompt(makePromptEvent().event);
    expect(await screen.findByTestId("pwa-install-banner")).toBeTruthy();
    simulateAppInstalled();
    await waitFor(() => expect(screen.queryByTestId("pwa-install-banner")).toBeNull());
    expect(localStorage.getItem(PWA_INSTALL_MARK_KEY)).toBe("1");
    expect(events).toContain("pwa_installed");
  });

  it("does not show in standalone mode even with prompt", async () => {
    mockMatchMedia(true);
    render(<PwaInstallBanner />);
    capturePrompt(makePromptEvent().event);
    await waitFor(() => expect(screen.queryByTestId("pwa-install-banner")).toBeNull());
  });

  it("shows iOS Safari instruction flow without fake prompt", async () => {
    setUa(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      5,
    );
    render(<PwaInstallBanner />);
    expect(await screen.findByTestId("pwa-install-banner")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Instalar" }));
    expect(await screen.findByTestId("pwa-install-ios-help")).toBeTruthy();
    expect(
      screen.getByText(/Compartilhar.*Adicionar à Tela de Início/i),
    ).toBeTruthy();
  });

  it("does not show Safari guide on iOS Chrome", async () => {
    setUa(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1",
      5,
    );
    render(<PwaInstallBanner />);
    expect(screen.queryByTestId("pwa-install-banner")).toBeNull();
  });

  it("persists dismiss for 7 days", async () => {
    render(<PwaInstallBanner />);
    capturePrompt(makePromptEvent().event);
    fireEvent.click(
      await screen.findByRole("button", { name: "Dispensar convite de instalação" }),
    );
    await waitFor(() => expect(screen.queryByTestId("pwa-install-banner")).toBeNull());
    expect(events).toContain("pwa_install_dismissed");
    const raw = localStorage.getItem(PWA_INSTALL_BANNER_DISMISS_KEY);
    expect(raw).toBeTruthy();
    const { dismissedAt } = JSON.parse(raw!) as { dismissedAt: number };
    expect(dismissedAt).toBeGreaterThan(Date.now() - 5000);

    cleanup();
    render(<PwaInstallBanner />);
    capturePrompt(makePromptEvent().event);
    expect(screen.queryByTestId("pwa-install-banner")).toBeNull();

    // Expire dismiss and allow re-show.
    localStorage.setItem(
      PWA_INSTALL_BANNER_DISMISS_KEY,
      JSON.stringify({ dismissedAt: Date.now() - PWA_INSTALL_DISMISS_MS - 1000 }),
    );
    cleanup();
    render(<PwaInstallBanner />);
    capturePrompt(makePromptEvent().event);
    expect(await screen.findByTestId("pwa-install-banner")).toBeTruthy();
  });

  it("renders a single banner instance (no duplicate roots)", async () => {
    const { container } = render(
      <>
        <PwaInstallBanner />
      </>,
    );
    capturePrompt(makePromptEvent().event);
    await screen.findByTestId("pwa-install-banner");
    expect(container.querySelectorAll('[data-testid="pwa-install-banner"]')).toHaveLength(1);
  });
});
