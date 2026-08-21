"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { IconX } from "@/components/ui/icons";
import {
  OFFICIAL_PWA_ICON_SRC,
  emitPwaInstallTelemetry,
  setDeferredInstallPrompt,
  writeDismiss,
} from "@/lib/pwa-install";
import { safeLocalStorage, usePwaInstallSurface } from "@/lib/use-pwa-install-surface";

type Mode = "hidden" | "native" | "ios-safari-guide" | "ios-help";

export function PwaInstallBanner() {
  const { surface, promptEvent, recompute } = usePwaInstallSurface();
  const [helpOpen, setHelpOpen] = useState(false);
  const prompting = useRef(false);
  const shownLogged = useRef(false);

  const mode: Mode = surface === "hidden" ? "hidden" : helpOpen ? "ios-help" : surface;

  useEffect(() => {
    if (mode === "hidden" || shownLogged.current) return;
    shownLogged.current = true;
    emitPwaInstallTelemetry("pwa_install_banner_shown");
  }, [mode]);

  async function onInstallClick() {
    if (surface === "ios-safari-guide") {
      setHelpOpen(true);
      emitPwaInstallTelemetry("pwa_install_clicked");
      return;
    }
    if (!promptEvent || prompting.current) return;
    prompting.current = true;
    emitPwaInstallTelemetry("pwa_install_clicked");
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      setDeferredInstallPrompt(null);
      if (choice.outcome === "accepted") {
        emitPwaInstallTelemetry("pwa_install_accepted");
      }
    } catch {
      setDeferredInstallPrompt(null);
    } finally {
      prompting.current = false;
      recompute();
    }
  }

  function onDismiss() {
    const storage = safeLocalStorage();
    if (storage) writeDismiss(storage);
    emitPwaInstallTelemetry("pwa_install_dismissed");
    recompute();
  }

  if (mode === "hidden") return null;

  if (mode === "ios-help") {
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
