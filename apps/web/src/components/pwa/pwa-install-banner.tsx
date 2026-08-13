"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { IconX } from "@/components/ui/icons";
import {
  OFFICIAL_PWA_ICON_SRC,
  type CroniuBeforeInstallPromptEvent,
  emitPwaInstallTelemetry,
  isStandaloneDisplay,
  readDismissedUntil,
  readInstalledMark,
  resolvePwaInstallSurface,
  writeDismiss,
  writeInstalledMark,
  type PwaInstallSurface,
} from "@/lib/pwa-install";

type Mode = PwaInstallSurface | "ios-help";

function safeLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function PwaInstallBanner() {
  const [surface, setSurface] = useState<Mode>("hidden");
  const deferredPrompt = useRef<CroniuBeforeInstallPromptEvent | null>(null);
  const prompting = useRef(false);
  const shownLogged = useRef(false);

  const recompute = useCallback((hasNative: boolean) => {
    if (typeof window === "undefined") {
      setSurface("hidden");
      return;
    }
    const storage = safeLocalStorage();
    const next = resolvePwaInstallSurface({
      standalone: isStandaloneDisplay(window),
      installedMark: readInstalledMark(storage),
      dismissed: readDismissedUntil(storage),
      hasNativePrompt: hasNative,
      userAgent: window.navigator.userAgent,
      maxTouchPoints: window.navigator.maxTouchPoints ?? 0,
    });
    setSurface(next);
  }, []);

  useEffect(() => {
    recompute(Boolean(deferredPrompt.current));

    function onBeforeInstall(event: Event) {
      event.preventDefault();
      deferredPrompt.current = event as CroniuBeforeInstallPromptEvent;
      recompute(true);
    }

    function onAppInstalled() {
      deferredPrompt.current = null;
      const storage = safeLocalStorage();
      if (storage) writeInstalledMark(storage);
      emitPwaInstallTelemetry("pwa_installed");
      setSurface("hidden");
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, [recompute]);

  useEffect(() => {
    if (surface === "hidden" || surface === "ios-help" || shownLogged.current) return;
    shownLogged.current = true;
    emitPwaInstallTelemetry("pwa_install_banner_shown");
  }, [surface]);

  async function onInstallClick() {
    if (surface === "ios-safari-guide") {
      setSurface("ios-help");
      emitPwaInstallTelemetry("pwa_install_clicked");
      return;
    }
    const promptEvent = deferredPrompt.current;
    if (!promptEvent || prompting.current) return;
    prompting.current = true;
    emitPwaInstallTelemetry("pwa_install_clicked");
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      deferredPrompt.current = null;
      if (choice.outcome === "accepted") {
        emitPwaInstallTelemetry("pwa_install_accepted");
        setSurface("hidden");
      } else {
        // Recusa do prompt nativo: não loop; limpa deferred e recalcula (some sem prompt).
        recompute(false);
      }
    } catch {
      deferredPrompt.current = null;
      recompute(false);
    } finally {
      prompting.current = false;
    }
  }

  function onDismiss() {
    const storage = safeLocalStorage();
    if (storage) writeDismiss(storage);
    deferredPrompt.current = null;
    emitPwaInstallTelemetry("pwa_install_dismissed");
    setSurface("hidden");
  }

  if (surface === "hidden") return null;

  if (surface === "ios-help") {
    return (
      <aside
        className="shrink-0 border-b border-[var(--color-border)]/80 bg-[var(--color-primary-subtle)]/55 px-4 py-3"
        aria-label="Como instalar o Croniu"
        data-testid="pwa-install-ios-help"
      >
        <div className="flex items-start gap-3">
          <p className="flex-1 text-sm text-[var(--color-ink)]">
            No Safari, toque em Compartilhar e depois em “Adicionar à Tela de Início”.
          </p>
          <button
            type="button"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-ink-muted)] hover:bg-[var(--color-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
            aria-label="Dispensar convite de instalação"
            onClick={onDismiss}
          >
            <IconX className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside
      className="shrink-0 border-b border-[var(--color-border)]/80 bg-[var(--color-primary-subtle)]/55 px-4 py-2.5"
      aria-label="Instalar o Croniu"
      data-testid="pwa-install-banner"
    >
      <div className="flex items-center gap-3">
        {/* Official PWA v3 icon (not UI cutout croniu-mark). */}
        {/* eslint-disable-next-line @next/next/no-img-element -- static public icon; matches BrandMark pattern */}
        <img
          src={OFFICIAL_PWA_ICON_SRC}
          alt=""
          width={40}
          height={40}
          className="h-10 w-10 shrink-0 rounded-[var(--radius-md)]"
          decoding="async"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[var(--color-ink)]">
            Tenha o Croniu sempre à mão
          </p>
          <p className="line-clamp-2 text-xs text-[var(--color-ink-muted)] sm:text-sm">
            Instale o aplicativo para acessar sua rotina mais rápido.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            type="button"
            variant="primary"
            className="min-h-10 px-3 text-sm"
            onClick={() => {
              void onInstallClick();
            }}
          >
            Instalar
          </Button>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-ink-muted)] hover:bg-[var(--color-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
            aria-label="Dispensar convite de instalação"
            onClick={onDismiss}
          >
            <IconX className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </aside>
  );
}
