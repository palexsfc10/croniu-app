import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PWA_INSTALL_BANNER_DISMISS_KEY,
  PWA_INSTALL_DISMISS_MS,
  PWA_INSTALL_MARK_KEY,
  clearDismiss,
  emitPwaInstallTelemetry,
  isIosLike,
  isIosSafari,
  isStandaloneDisplay,
  readDismissedUntil,
  readInstalledMark,
  resolvePwaInstallSurface,
  subscribePwaInstallTelemetry,
  writeDismiss,
  writeInstalledMark,
} from "@/lib/pwa-install";

function memoryStorage(seed: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(seed));
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
  };
}

describe("pwa-install helpers", () => {
  it("detects iOS / iPadOS conservatively", () => {
    expect(isIosLike("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe(true);
    expect(isIosLike("Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)")).toBe(true);
    expect(isIosLike("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5)).toBe(true);
    expect(isIosLike("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0)).toBe(false);
    expect(isIosLike("Mozilla/5.0 (Linux; Android 14)")).toBe(false);
  });

  it("limits Safari guide to iOS Safari only", () => {
    const safari =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
    const chromeIos =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1";
    expect(isIosSafari(safari)).toBe(true);
    expect(isIosSafari(chromeIos)).toBe(false);
    expect(isIosSafari("Mozilla/5.0 (Linux; Android 14) Chrome/120.0.0.0")).toBe(false);
  });

  it("hides without native prompt and outside eligible iOS Safari", () => {
    expect(
      resolvePwaInstallSurface({
        standalone: false,
        installedMark: false,
        dismissed: false,
        hasNativePrompt: false,
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
        maxTouchPoints: 0,
      }),
    ).toBe("hidden");
  });

  it("shows native surface when deferred prompt exists", () => {
    expect(
      resolvePwaInstallSurface({
        standalone: false,
        installedMark: false,
        dismissed: false,
        hasNativePrompt: true,
        userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/120.0.0.0",
        maxTouchPoints: 5,
      }),
    ).toBe("native");
  });

  it("shows ios safari guide without inventing install", () => {
    const safari =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
    expect(
      resolvePwaInstallSurface({
        standalone: false,
        installedMark: false,
        dismissed: false,
        hasNativePrompt: false,
        userAgent: safari,
        maxTouchPoints: 5,
      }),
    ).toBe("ios-safari-guide");
  });

  it("hides in standalone / installed / dismissed", () => {
    const base = {
      hasNativePrompt: true,
      userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/120.0.0.0",
      maxTouchPoints: 5,
    };
    expect(
      resolvePwaInstallSurface({
        ...base,
        standalone: true,
        installedMark: false,
        dismissed: false,
      }),
    ).toBe("hidden");
    expect(
      resolvePwaInstallSurface({
        ...base,
        standalone: false,
        installedMark: true,
        dismissed: false,
      }),
    ).toBe("hidden");
    expect(
      resolvePwaInstallSurface({
        ...base,
        standalone: false,
        installedMark: false,
        dismissed: true,
      }),
    ).toBe("hidden");
  });

  it("persists dismiss for 7 days and allows re-show after", () => {
    const storage = memoryStorage();
    const t0 = 1_700_000_000_000;
    writeDismiss(storage, t0);
    expect(readDismissedUntil(storage, t0 + 1000)).toBe(true);
    expect(readDismissedUntil(storage, t0 + PWA_INSTALL_DISMISS_MS - 1)).toBe(true);
    expect(readDismissedUntil(storage, t0 + PWA_INSTALL_DISMISS_MS + 1)).toBe(false);
    clearDismiss(storage);
    expect(readDismissedUntil(storage, t0)).toBe(false);
    expect(storage.getItem(PWA_INSTALL_BANNER_DISMISS_KEY)).toBeNull();
  });

  it("marks installed in browser storage without PII", () => {
    const storage = memoryStorage();
    expect(readInstalledMark(storage)).toBe(false);
    writeInstalledMark(storage);
    expect(readInstalledMark(storage)).toBe(true);
    expect(storage.getItem(PWA_INSTALL_MARK_KEY)).toBe("1");
  });

  it("detects standalone via matchMedia / navigator.standalone", () => {
    const matchMedia = vi.fn((query: string) => ({
      matches: query.includes("standalone"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const win = {
      matchMedia,
      navigator: { standalone: false },
    } as unknown as Window;
    expect(isStandaloneDisplay(win)).toBe(true);

    const iosWin = {
      matchMedia: vi.fn(() => ({ matches: false })),
      navigator: { standalone: true },
    } as unknown as Window;
    expect(isStandaloneDisplay(iosWin)).toBe(true);
  });

  it("emits internal telemetry without external analytics", () => {
    const seen: string[] = [];
    const off = subscribePwaInstallTelemetry((e) => seen.push(e));
    emitPwaInstallTelemetry("pwa_install_banner_shown");
    emitPwaInstallTelemetry("pwa_install_clicked");
    off();
    emitPwaInstallTelemetry("pwa_installed");
    expect(seen).toEqual(["pwa_install_banner_shown", "pwa_install_clicked"]);
  });
});

describe("SSR safety", () => {
  beforeEach(() => {
    vi.stubGlobal("window", undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolve helpers do not require window", () => {
    expect(
      resolvePwaInstallSurface({
        standalone: false,
        installedMark: false,
        dismissed: false,
        hasNativePrompt: false,
        userAgent: "node",
        maxTouchPoints: 0,
      }),
    ).toBe("hidden");
  });
});
