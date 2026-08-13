/** PWA install invitation helpers — browser-only, no PII, no backend sync. */

export const PWA_INSTALL_BANNER_DISMISS_KEY = "croniu:pwa-install-banner:v1";
export const PWA_INSTALL_MARK_KEY = "croniu:pwa-installed:v1";
export const PWA_INSTALL_DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

export const OFFICIAL_PWA_ICON_SRC = "/icons/icon-192-v3.png";

export type PwaInstallTelemetryEvent =
  | "pwa_install_banner_shown"
  | "pwa_install_clicked"
  | "pwa_install_accepted"
  | "pwa_install_dismissed"
  | "pwa_installed";

export type BeforeInstallPromptOutcome = "accepted" | "dismissed";

/** Minimal shape of Chromium's beforeinstallprompt event. */
export type CroniuBeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: BeforeInstallPromptOutcome; platform: string }>;
};

export type PwaInstallSurface =
  | "hidden"
  | "native" // Chromium deferred prompt available
  | "ios-safari-guide"; // instructional only

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const telemetryListeners = new Set<(event: PwaInstallTelemetryEvent) => void>();

export function subscribePwaInstallTelemetry(
  listener: (event: PwaInstallTelemetryEvent) => void,
): () => void {
  telemetryListeners.add(listener);
  return () => {
    telemetryListeners.delete(listener);
  };
}

export function emitPwaInstallTelemetry(event: PwaInstallTelemetryEvent): void {
  for (const listener of telemetryListeners) {
    try {
      listener(event);
    } catch {
      // Telemetry must never break UX.
    }
  }
}

export function isStandaloneDisplay(win: Window = window): boolean {
  try {
    if (win.matchMedia("(display-mode: standalone)").matches) return true;
    if (win.matchMedia("(display-mode: fullscreen)").matches) return true;
  } catch {
    // matchMedia may be unavailable in some test/SSR stubs.
  }
  const nav = win.navigator as Navigator & { standalone?: boolean };
  return Boolean(nav.standalone);
}

export function isIosLike(userAgent: string, maxTouchPoints = 0): boolean {
  if (/iPhone|iPod/i.test(userAgent)) return true;
  if (/iPad/i.test(userAgent)) return true;
  // iPadOS 13+ may report as Macintosh with touch.
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return true;
  return false;
}

/** Safari on iOS/iPadOS (not CriOS/FxiOS/etc.). */
export function isIosSafari(userAgent: string, maxTouchPoints = 0): boolean {
  if (!isIosLike(userAgent, maxTouchPoints)) return false;
  if (/CriOS|FxiOS|EdgiOS|OPiOS|Chrome|Android/i.test(userAgent)) return false;
  return /Safari/i.test(userAgent);
}

export function readDismissedUntil(
  storage: StorageLike | null | undefined,
  now = Date.now(),
): boolean {
  if (!storage) return false;
  try {
    const raw = storage.getItem(PWA_INSTALL_BANNER_DISMISS_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { dismissedAt?: number };
    const at = Number(parsed?.dismissedAt);
    if (!Number.isFinite(at)) return false;
    return now - at < PWA_INSTALL_DISMISS_MS;
  } catch {
    return false;
  }
}

export function writeDismiss(storage: StorageLike, now = Date.now()): void {
  storage.setItem(
    PWA_INSTALL_BANNER_DISMISS_KEY,
    JSON.stringify({ dismissedAt: now }),
  );
}

export function clearDismiss(storage: StorageLike): void {
  storage.removeItem(PWA_INSTALL_BANNER_DISMISS_KEY);
}

export function readInstalledMark(storage: StorageLike | null | undefined): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(PWA_INSTALL_MARK_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeInstalledMark(storage: StorageLike): void {
  storage.setItem(PWA_INSTALL_MARK_KEY, "1");
}

export function resolvePwaInstallSurface(input: {
  standalone: boolean;
  installedMark: boolean;
  dismissed: boolean;
  hasNativePrompt: boolean;
  userAgent: string;
  maxTouchPoints: number;
}): PwaInstallSurface {
  if (input.standalone || input.installedMark || input.dismissed) return "hidden";
  if (input.hasNativePrompt) return "native";
  if (isIosSafari(input.userAgent, input.maxTouchPoints)) return "ios-safari-guide";
  return "hidden";
}
