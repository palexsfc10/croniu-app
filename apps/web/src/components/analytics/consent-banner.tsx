"use client";

import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
  getStoredConsent,
  pushConsentUpdate,
  storeConsent,
  type ConsentChoice,
} from "@/lib/analytics/consent";
import { isGtmScriptAllowed } from "@/lib/analytics/gtm";
import { isMetaPixelEnvAllowed } from "@/lib/analytics/meta-pixel";

export const OPEN_CONSENT_PREFERENCES_EVENT = "croniu:app-open-consent-preferences";

const DEFAULT_DRAFT: ConsentChoice = { analytics: false, marketing: false };

function subscribeNothing(): () => void {
  return () => {};
}

function hasNoStoredChoiceServerSnapshot(): boolean {
  return false;
}

type Props = { isHml: boolean };

/**
 * App-scoped equivalent of croniu-site's ConsentBanner — same three-choice
 * UX (Aceitar todos / Recusar opcionais / Configurar), own storage key and
 * design tokens. Only rendered where at least one gated script could
 * possibly load (`isGtmScriptAllowed` or `isMetaPixelScriptAllowed`) — never
 * in HML or local dev, so no banner appears where nothing is tracked.
 */
export function ConsentBanner({ isHml }: Props) {
  const anyScriptCouldLoad = isGtmScriptAllowed(isHml) || isMetaPixelEnvAllowed(isHml);

  function hasNoStoredChoice(): boolean {
    return anyScriptCouldLoad && getStoredConsent() === null;
  }

  const showOnFirstPaint = useSyncExternalStore(
    subscribeNothing,
    hasNoStoredChoice,
    hasNoStoredChoiceServerSnapshot,
  );
  const [manualVisible, setManualVisible] = useState<boolean | null>(null);
  const visible = manualVisible ?? showOnFirstPaint;
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState<ConsentChoice>(DEFAULT_DRAFT);
  const analyticsId = useId();
  const marketingId = useId();

  useEffect(() => {
    function handleReopen() {
      setDraft(getStoredConsent() ?? DEFAULT_DRAFT);
      setExpanded(true);
      setManualVisible(true);
    }
    window.addEventListener(OPEN_CONSENT_PREFERENCES_EVENT, handleReopen);
    return () => window.removeEventListener(OPEN_CONSENT_PREFERENCES_EVENT, handleReopen);
  }, []);

  function apply(choice: ConsentChoice) {
    storeConsent(choice);
    pushConsentUpdate(choice);
    setManualVisible(false);
    setExpanded(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Preferências de cookies"
      aria-modal="false"
      className="fixed inset-x-0 bottom-0 z-[60] px-4 pb-4 sm:px-6"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-lg sm:p-6">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-[var(--color-ink)]">Cookies e privacidade</p>
          <p className="text-sm text-[var(--color-ink-muted)]">
            Usamos cookies essenciais para o app funcionar e, com sua permissão, cookies de
            análise e de campanhas para entender como você chega até o Croniu.{" "}
            <a
              href="/privacidade"
              className="font-medium text-[var(--color-primary)] underline underline-offset-2"
            >
              Política de Privacidade
            </a>
            .
          </p>
        </div>

        {expanded ? (
          <div className="flex flex-col gap-3 border-t border-[var(--color-border)] pt-4">
            <label className="flex items-start gap-3 text-sm text-[var(--color-ink-muted)]">
              <input type="checkbox" checked disabled className="mt-0.5" />
              <span>
                <span className="font-medium text-[var(--color-ink)]">Necessários</span> — sempre
                ativos, indispensáveis para o app funcionar.
              </span>
            </label>
            <label htmlFor={analyticsId} className="flex items-start gap-3 text-sm text-[var(--color-ink-muted)]">
              <input
                id={analyticsId}
                type="checkbox"
                checked={draft.analytics}
                onChange={(e) => setDraft((d) => ({ ...d, analytics: e.target.checked }))}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium text-[var(--color-ink)]">Analytics</span> — nos ajuda
                a entender como você usa o Croniu (Google Analytics, via Google Tag Manager).
              </span>
            </label>
            <label htmlFor={marketingId} className="flex items-start gap-3 text-sm text-[var(--color-ink-muted)]">
              <input
                id={marketingId}
                type="checkbox"
                checked={draft.marketing}
                onChange={(e) => setDraft((d) => ({ ...d, marketing: e.target.checked }))}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium text-[var(--color-ink)]">Marketing</span> — mede o
                resultado de campanhas de anúncio (Meta Pixel).
              </span>
            </label>
          </div>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          {expanded ? (
            <Button variant="secondary" size="md" onClick={() => apply(draft)}>
              Salvar preferências
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="md"
              onClick={() => {
                setDraft(getStoredConsent() ?? DEFAULT_DRAFT);
                setExpanded(true);
              }}
            >
              Configurar
            </Button>
          )}
          <Button
            variant="secondary"
            size="md"
            onClick={() => apply({ analytics: false, marketing: false })}
          >
            Recusar opcionais
          </Button>
          <Button size="md" onClick={() => apply({ analytics: true, marketing: true })}>
            Aceitar todos
          </Button>
        </div>
      </div>
    </div>
  );
}
