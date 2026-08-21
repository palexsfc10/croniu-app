"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type CroniuBeforeInstallPromptEvent,
  type PwaInstallSurface,
  getDeferredInstallPrompt,
  isStandaloneDisplay,
  readDismissedUntil,
  readInstalledMark,
  resolvePwaInstallSurface,
  subscribeDeferredInstallPrompt,
} from "@/lib/pwa-install";

export function safeLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Reactive install surface, reading the shared deferred-prompt singleton
 * (captured once, at the AppShell level, regardless of which page is
 * currently mounted — see AppShell's beforeinstallprompt listener).
 *
 * Pass `ignoreDismiss` for a permanent entry (e.g. the "Instalar Croniu"
 * item in Mais) that must keep working even after the home banner was
 * dismissed — dismissing the banner is a preference about the banner, not
 * about whether installing is still possible.
 */
export function usePwaInstallSurface(options: { ignoreDismiss?: boolean } = {}): {
  surface: PwaInstallSurface;
  promptEvent: CroniuBeforeInstallPromptEvent | null;
  /** True when standalone or the installed mark is set — tracked as its
   * own state (not derived from `surface`) because two different reasons
   * ("nothing installable right now" vs. "already installed") can both
   * resolve to the same `surface === "hidden"` string. If callers only
   * watched `surface`, React would bail out of re-rendering on the
   * install→installed transition since the string value doesn't change. */
  installed: boolean;
  recompute: () => void;
} {
  const { ignoreDismiss = false } = options;
  const [promptEvent, setPromptEvent] = useState<CroniuBeforeInstallPromptEvent | null>(null);
  const [surface, setSurface] = useState<PwaInstallSurface>("hidden");
  const [installed, setInstalled] = useState(false);

  const recompute = useCallback(() => {
    if (typeof window === "undefined") return;
    const current = getDeferredInstallPrompt();
    setPromptEvent(current);
    const storage = safeLocalStorage();
    const standalone = isStandaloneDisplay(window);
    const installedMark = readInstalledMark(storage);
    setInstalled(standalone || installedMark);
    setSurface(
      resolvePwaInstallSurface({
        standalone,
        installedMark,
        dismissed: ignoreDismiss ? false : readDismissedUntil(storage),
        hasNativePrompt: Boolean(current),
        userAgent: window.navigator.userAgent,
        maxTouchPoints: window.navigator.maxTouchPoints ?? 0,
      }),
    );
  }, [ignoreDismiss]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount/remote hydrate
    recompute();
    return subscribeDeferredInstallPrompt(() => recompute());
  }, [recompute]);

  return { surface, promptEvent, installed, recompute };
}
