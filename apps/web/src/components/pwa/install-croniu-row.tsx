"use client";

import { useState } from "react";
import { SettingsRow } from "@/components/app/settings-list";
import { IconCheck, IconExternalLink } from "@/components/ui/icons";
import { emitPwaInstallTelemetry, isIosSafari, setDeferredInstallPrompt } from "@/lib/pwa-install";
import { usePwaInstallSurface } from "@/lib/use-pwa-install-surface";

/**
 * Permanent "Instalar Croniu" entry for the Mais screen. Unlike the home
 * banner, this must keep working even after the banner was dismissed
 * (ignoreDismiss) and must never disappear just because the browser hasn't
 * fired a native prompt — for that case it falls back to plain manual
 * instructions instead of a button that would do nothing.
 */
export function InstallCroniuRow() {
  const { surface, promptEvent, installed, recompute } = usePwaInstallSurface({
    ignoreDismiss: true,
  });
  const [busy, setBusy] = useState(false);
  const [showManualHelp, setShowManualHelp] = useState(false);

  async function onClick() {
    if (installed) return;
    if (surface === "native" && promptEvent) {
      if (busy) return;
      setBusy(true);
      emitPwaInstallTelemetry("pwa_install_clicked");
      try {
        await promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        setDeferredInstallPrompt(null);
        if (choice.outcome === "accepted") emitPwaInstallTelemetry("pwa_install_accepted");
      } catch {
        setDeferredInstallPrompt(null);
      } finally {
        setBusy(false);
        recompute();
      }
      return;
    }
    // iOS Safari or any browser without a captured prompt: no fake action,
    // just reveal the manual instructions in place.
    setShowManualHelp((value) => !value);
  }

  if (installed) {
    return (
      <SettingsRow
        title="Croniu já está instalado"
        description="Você já pode abrir o Croniu direto da tela inicial."
        Icon={IconCheck}
      />
    );
  }

  const isIos =
    typeof window !== "undefined" &&
    isIosSafari(window.navigator.userAgent, window.navigator.maxTouchPoints ?? 0);

  const description =
    surface === "native"
      ? "Acesse sua agenda e seus alunos mais rápido pelo celular."
      : showManualHelp && isIos
        ? "Toque em Compartilhar e depois em “Adicionar à Tela de Início”."
        : showManualHelp
          ? "Abra o menu do navegador e procure “Instalar aplicativo” ou “Adicionar à tela inicial”."
          : "Toque para ver como instalar no seu aparelho.";

  return (
    <SettingsRow
      title="Instalar Croniu"
      description={description}
      Icon={IconExternalLink}
      onClick={() => void onClick()}
    />
  );
}
