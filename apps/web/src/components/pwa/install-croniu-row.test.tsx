import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InstallCroniuRow } from "@/components/pwa/install-croniu-row";
import {
  setDeferredInstallPrompt,
  writeInstalledMark,
  type CroniuBeforeInstallPromptEvent,
} from "@/lib/pwa-install";

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
  Object.defineProperty(window.navigator, "userAgent", { configurable: true, get: () => ua });
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

describe("InstallCroniuRow", () => {
  beforeEach(() => {
    localStorage.clear();
    setDeferredInstallPrompt(null);
    mockMatchMedia(false);
    setUa("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0");
  });

  afterEach(() => {
    cleanup();
    setDeferredInstallPrompt(null);
    vi.restoreAllMocks();
  });

  it("shows manual guidance (not a fake button) when no native prompt is available", () => {
    render(<InstallCroniuRow />);
    expect(screen.getByText("Instalar Croniu")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Instalar Croniu"));
    expect(
      screen.getByText(/Abra o menu do navegador e procure/i),
    ).toBeInTheDocument();
  });

  it("triggers the native prompt when a beforeinstallprompt event is available", async () => {
    const { event, prompt } = makePromptEvent("accepted");
    setDeferredInstallPrompt(event);
    render(<InstallCroniuRow />);
    fireEvent.click(await screen.findByText("Instalar Croniu"));
    await waitFor(() => expect(prompt).toHaveBeenCalledTimes(1));
    // Accepting the native dialog doesn't itself mean installed yet — the
    // browser fires a separate `appinstalled` event once the install
    // actually completes (captured by AppShell in real usage).
    expect(screen.queryByText("Croniu já está instalado")).not.toBeInTheDocument();
    writeInstalledMark(localStorage);
    setDeferredInstallPrompt(null);
    await waitFor(() =>
      expect(screen.getByText("Croniu já está instalado")).toBeInTheDocument(),
    );
  });

  it("shows iOS Safari instructions on tap instead of a native prompt", () => {
    setUa(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      5,
    );
    render(<InstallCroniuRow />);
    fireEvent.click(screen.getByText("Instalar Croniu"));
    expect(
      screen.getByText(/Compartilhar.*Adicionar à Tela de Início/i),
    ).toBeInTheDocument();
  });

  it("shows an already-installed state in standalone mode, without a clickable install action", () => {
    mockMatchMedia(true);
    render(<InstallCroniuRow />);
    expect(screen.getByText("Croniu já está instalado")).toBeInTheDocument();
    expect(screen.queryByText("Instalar Croniu")).not.toBeInTheDocument();
  });

  it("keeps working even when the home banner was dismissed", () => {
    localStorage.setItem(
      "croniu:pwa-install-banner:v1",
      JSON.stringify({ dismissedAt: Date.now() }),
    );
    const { event } = makePromptEvent();
    setDeferredInstallPrompt(event);
    render(<InstallCroniuRow />);
    expect(screen.getByText("Instalar Croniu")).toBeInTheDocument();
  });
});
