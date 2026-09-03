"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { PortalIntakeStatus, PublicMyCycle } from "@/lib/api";
import { BrandWordmark } from "@/components/brand/brand-wordmark";
import { PortalView } from "@/components/app/portal-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconAlertCircle, IconClipboardList } from "@/components/ui/icons";

export default function PublicMyCyclePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [data, setData] = useState<PublicMyCycle | null>(null);
  const [intakeStatus, setIntakeStatus] = useState<PortalIntakeStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      setError(null);
      const [res, intakeRes] = await Promise.all([
        fetch(`/api/v1/public/my-cycle/${token}`, {
          headers: { Accept: "application/json" },
          cache: "no-store",
        }),
        fetch(`/api/v1/public/intake/portal/${token}/status`, {
          headers: { Accept: "application/json" },
          cache: "no-store",
        }),
      ]);
      const body = await res.json();
      if (cancelled) return;
      if (intakeRes.ok) {
        const intakeBody = (await intakeRes.json()) as PortalIntakeStatus;
        if (!cancelled) setIntakeStatus(intakeBody);
      } else if (!cancelled) {
        setIntakeStatus(null);
      }
      if (!res.ok) {
        // Pré-aprovação: portal de intake pode existir sem ciclo ainda.
        if (intakeRes.ok) {
          setData(null);
          setError(null);
          return;
        }
        setError(body.message || "Este acesso não está disponível.");
        setData(null);
        return;
      }
      setData(body as PublicMyCycle);
    }

    // A professional's decision (request changes / approve / reject) can
    // land while this tab is just sitting open — revalidate on return
    // instead of leaving a stale "sem ciclo" or "aguardando análise"
    // message up. No polling: only reacts to the visitor actually coming
    // back to the tab, which is cheap and matches how they'd notice a
    // WhatsApp notification anyway.
    async function refreshIntakeStatusOnly() {
      const intakeRes = await fetch(`/api/v1/public/intake/portal/${token}/status`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (cancelled) return;
      if (intakeRes.ok) {
        setIntakeStatus((await intakeRes.json()) as PortalIntakeStatus);
      }
    }

    function onVisible() {
      if (document.visibilityState === "visible") void refreshIntakeStatusOnly();
    }

    void loadAll();
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [token]);

  async function reload() {
    setError(null);
    const res = await fetch(`/api/v1/public/my-cycle/${token}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.message || "Este acesso não está disponível.");
      setData(null);
      return;
    }
    setData(body as PublicMyCycle);
  }

  async function requestRenewal() {
    setBusy(true);
    setFlash(null);
    const res = await fetch(`/api/v1/public/my-cycle/${token}/renewal`, {
      method: "POST",
      headers: { Accept: "application/json" },
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(body.message || "Não foi possível enviar.");
      return;
    }
    setFlash(body.message);
    await reload();
  }

  async function declareRenewalPayment() {
    setBusy(true);
    setFlash(null);
    const res = await fetch(`/api/v1/public/my-cycle/${token}/renewal/declare-payment`, {
      method: "POST",
      headers: { Accept: "application/json" },
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(body.message || body.detail?.message || "Não foi possível informar.");
      return;
    }
    setFlash(body.message);
    await reload();
  }

  async function reportPayment(methodNote: string, notes: string) {
    setBusy(true);
    setFlash(null);
    const form = new FormData();
    if (methodNote.trim()) form.append("method_note", methodNote.trim());
    if (notes.trim()) form.append("notes", notes.trim());
    const res = await fetch(`/api/v1/public/my-cycle/${token}/payment-report`, {
      method: "POST",
      body: form,
      headers: { Accept: "application/json" },
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(body.message || "Não foi possível informar o pagamento.");
      return;
    }
    setFlash(body.message);
    await reload();
  }

  return (
    <div className="min-h-dvh bg-[linear-gradient(165deg,var(--color-bg)_0%,var(--color-progress-subtle)_42%,var(--color-primary-subtle)_100%)]">
      <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 py-6 sm:px-6 md:py-10">
        <header className="mb-9 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-[var(--color-ink-muted)]">Meu Ciclo</p>
            {data || intakeStatus?.client_first_name ? (
              <h1 className="mt-1 font-[family-name:var(--font-display)] text-[1.75rem] leading-tight text-[var(--color-ink)]">
                Olá, {data?.client_first_name || intakeStatus?.client_first_name}
              </h1>
            ) : (
              <h1 className="mt-1 text-2xl text-[var(--color-ink)]">Acesso</h1>
            )}
          </div>
          <BrandWordmark size="md" />
        </header>

        {error ? (
          <p
            role="alert"
            className="rounded-[var(--radius-md)] border border-[var(--color-danger)]/25 bg-[var(--color-danger-subtle)] px-4 py-4 text-sm text-[var(--color-danger)]"
          >
            {error}
          </p>
        ) : null}
        {flash ? (
          <p
            role="status"
            className="mb-3 rounded-[var(--radius-md)] border border-[var(--color-success)]/20 bg-[var(--color-success-subtle)] px-3 py-2 text-sm text-[var(--color-success)]"
          >
            {flash}
          </p>
        ) : null}

        {!data && !intakeStatus && !error ? (
          <p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p>
        ) : null}

        {intakeStatus?.submission_status === "changes_requested" ? (
          // Highest priority: a pending correction always has precedence
          // over "sem ciclo ainda" / the cycle card itself, on any device,
          // an old portal link, or a page opened before the request was
          // made (the effect below revalidates on focus/return).
          <section className="mb-5 space-y-3 rounded-[var(--radius-lg)] border border-[var(--color-warning)]/30 bg-[var(--color-warning-subtle)] p-5 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <IconAlertCircle className="h-5 w-5 shrink-0 text-[var(--color-warning)]" aria-hidden />
              <h2 className="text-base font-semibold text-[var(--color-ink)]">
                Seu profissional solicitou um ajuste
              </h2>
              <Badge tone="warning">Ajustes solicitados</Badge>
            </div>
            <p className="text-sm text-[var(--color-ink)]">
              Revise as informações abaixo para concluir seu cadastro.
            </p>
            {intakeStatus.message_to_client ? (
              <p className="rounded-[var(--radius-md)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)]">
                {intakeStatus.message_to_client}
              </p>
            ) : null}
            {intakeStatus.correction_path ? (
              <a href={intakeStatus.correction_path} className="block">
                <Button fullWidth>Corrigir minha anamnese</Button>
              </a>
            ) : null}
          </section>
        ) : null}

        {intakeStatus &&
        intakeStatus.submission_status !== "changes_requested" &&
        (intakeStatus.journey_stage === "pending_review" ||
          intakeStatus.submission_status === "pending_review" ||
          !data) ? (
          <section className="mb-5 space-y-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <IconClipboardList className="h-5 w-5 shrink-0 text-[var(--color-ink-muted)]" aria-hidden />
              <h2 className="text-base font-semibold text-[var(--color-ink)]">Seu cadastro</h2>
              <Badge tone="warning">{intakeStatus.journey_label}</Badge>
            </div>
            {intakeStatus.message_to_client ? (
              <p className="text-sm text-[var(--color-ink)]">{intakeStatus.message_to_client}</p>
            ) : (
              <p className="text-sm text-[var(--color-ink-muted)]">
                Seu profissional está analisando as informações. Assim que houver novidade, você
                verá aqui.
              </p>
            )}
            {intakeStatus.requires_professional_attention && intakeStatus.attention_message ? (
              <p className="text-sm text-[var(--color-ink)]">{intakeStatus.attention_message}</p>
            ) : null}
            {!data && intakeStatus.professional_public_name ? (
              <p className="text-sm text-[var(--color-ink-muted)]">
                Com {intakeStatus.professional_public_name}
              </p>
            ) : null}
          </section>
        ) : null}

        {data ? (
          <PortalView
            data={data}
            mode="public"
            busy={busy}
            onRequestRenewal={() => void requestRenewal()}
            onDeclareRenewalPayment={() => void declareRenewalPayment()}
            onReportPayment={(methodNote, notes) => void reportPayment(methodNote, notes)}
          />
        ) : null}
      </main>
    </div>
  );
}
