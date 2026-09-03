"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  apiFetch,
  formatBRL,
  formatDateBR,
  type Cycle,
  type Receivable,
  type WhatsAppPrep,
} from "@/lib/api";
import { formatCycleDetailLines } from "@/lib/date-format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockError } from "@/components/ui/block-error";
import { ContextualBar } from "@/components/app/contextual-bar";
import { BackLink } from "@/components/app/back-link";
import { receivableStatusLabel, receivableStatusTone } from "@/lib/status-tone";

export default function CycleDetailPage() {
  const params = useParams<{ cycleId: string }>();
  const router = useRouter();
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [prep, setPrep] = useState<WhatsAppPrep | null>(null);
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [c, r] = await Promise.all([
        apiFetch<Cycle>(`/api/v1/cycles/${params.cycleId}`),
        apiFetch<Receivable[]>("/api/v1/receivables"),
      ]);
      if (cancelled) return;
      if (c.error) setError(c.error.message);
      else setCycle(c.data ?? null);
      setReceivables((r.data ?? []).filter((item) => item.cycle_id === params.cycleId));
    })();
    return () => {
      cancelled = true;
    };
  }, [params.cycleId]);

  async function reload() {
    const [c, r] = await Promise.all([
      apiFetch<Cycle>(`/api/v1/cycles/${params.cycleId}`),
      apiFetch<Receivable[]>("/api/v1/receivables"),
    ]);
    if (c.error) setError(c.error.message);
    else setCycle(c.data ?? null);
    setReceivables((r.data ?? []).filter((item) => item.cycle_id === params.cycleId));
  }
  async function prepareWhatsApp() {
    setBusy(true);
    setError(null);
    const result = await apiFetch<WhatsAppPrep>(`/api/v1/cycles/${params.cycleId}/whatsapp-prep`, {
      method: "POST",
    });
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setPrep(result.data ?? null);
    await reload();
  }

  async function confirmContact() {
    setBusy(true);
    setError(null);
    const result = await apiFetch<Cycle>(`/api/v1/cycles/${params.cycleId}/confirm-contact`, {
      method: "POST",
      body: JSON.stringify({ note: "Contato confirmado manualmente" }),
    });
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setCycle(result.data ?? null);
  }

  async function cancelCycle() {
    const ok = window.confirm(
      "Excluir este ciclo? Ele será cancelado; aulas agendadas e recebimentos em aberto também.",
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    const result = await apiFetch<Cycle>(`/api/v1/cycles/${params.cycleId}/cancel`, {
      method: "POST",
    });
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    router.replace("/app/cycles");
  }

  return (
    <div className="space-y-5 animate-fade-up">
      <ContextualBar
        label={cycle ? `Ciclo · ${cycle.client_name} · ${cycle.service_name}` : null}
      />
      <BackLink href="/app/cycles" label="Ciclos" />
      {error ? <BlockError message={error} /> : null}
      {cycle ? (
        <>
          <header className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="h-display text-2xl text-[var(--color-ink)] md:text-3xl">
                {cycle.client_name}
              </h1>
              <Badge tone="neutral">{cycle.status}</Badge>
            </div>
            <p className="text-sm text-[var(--color-ink-muted)]">
              {cycle.service_name} · {formatCycleDetailLines(cycle.starts_on, cycle.ends_on).vigency}
              {cycle.is_legacy ? " · ciclo legado" : ""}
            </p>
          </header>

          <section className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3.5 shadow-sm">
            <p className="text-sm text-[var(--color-ink-muted)]">
              {formatCycleDetailLines(cycle.starts_on, cycle.ends_on).lessonsUntil} ·{" "}
              {formatCycleDetailLines(cycle.starts_on, cycle.ends_on).renewal}
            </p>
            {cycle.lesson_count != null ? (
              <p className="text-sm text-[var(--color-ink)]">
                {cycle.lessons_completed ?? 0} realizadas · {cycle.lessons_remaining ?? cycle.lesson_count}{" "}
                restantes · {cycle.lesson_count} no ciclo
                {cycle.unit_price_cents != null ? ` · ${formatBRL(cycle.unit_price_cents)} / aula` : ""}
              </p>
            ) : null}
            {cycle.subtotal_cents != null ? (
              <p className="text-sm text-[var(--color-ink-muted)]">
                {cycle.pricing_mode === "fixed_period" ? "Valor do plano" : "Subtotal"}{" "}
                {formatBRL(cycle.subtotal_cents)}
                {cycle.adjustment_cents ? ` · ajuste ${formatBRL(cycle.adjustment_cents)}` : ""}
              </p>
            ) : null}
            <p className="text-base font-semibold tabular-nums text-[var(--color-ink)]">
              Total: {formatBRL(cycle.value_cents)}
            </p>
          </section>

          {cycle.is_nearing_end ? (
            <p className="card-rail card-rail-warning rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2.5 text-sm shadow-sm">
              Ciclo encerrando{cycle.days_remaining != null ? ` em ${cycle.days_remaining} dia(s)` : ""}.
            </p>
          ) : null}

          {cycle.status !== "cancelled" ? (
            <div className="flex flex-wrap gap-2">
              <Link href={`/app/cycles/${cycle.id}/edit`}>
                <Button>Editar ciclo</Button>
              </Link>
              {!cycle.is_legacy ? (
                <Link href={`/app/cycles/${cycle.id}/financial`}>
                  <Button variant="secondary">Editar valores</Button>
                </Link>
              ) : null}
              <Button variant="secondary" disabled={busy} onClick={() => void cancelCycle()}>
                Excluir ciclo
              </Button>
            </div>
          ) : (
            <p className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3.5 py-2.5 text-sm shadow-sm">
              Este ciclo foi excluído (cancelado).
            </p>
          )}

          <section className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3.5 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
              Contato de renovação
            </h2>
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy} onClick={() => void prepareWhatsApp()}>
                Preparar mensagem WhatsApp
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => void confirmContact()}>
                Confirmar contato manualmente
              </Button>
            </div>
            {prep ? (
              <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-3">
                <h3 className="text-sm font-semibold text-[var(--color-ink)]">Mensagem pronta</h3>
                <p className="whitespace-pre-wrap text-sm text-[var(--color-ink-muted)]">{prep.message}</p>
                {prep.can_open_whatsapp && prep.wa_url ? (
                  <a href={prep.wa_url} target="_blank" rel="noreferrer">
                    <Button variant="secondary">Abrir WhatsApp (sem envio automático)</Button>
                  </a>
                ) : (
                  <p className="text-sm text-[var(--color-warning)]">
                    Cliente sem telefone — copie a mensagem e envie manualmente.
                  </p>
                )}
              </div>
            ) : null}
            {cycle.contact_confirmed_at ? (
              <p className="text-sm text-[var(--color-success)]">
                Contato confirmado em {new Date(cycle.contact_confirmed_at).toLocaleString("pt-BR")}
              </p>
            ) : null}
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
              Recebimentos
            </h2>
            {!receivables.length ? (
              <p className="text-sm text-[var(--color-ink-muted)]">Nenhum recebimento neste ciclo.</p>
            ) : (
              <ul className="divide-y divide-[var(--color-border)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)]/80 bg-[var(--color-surface)] shadow-sm">
                {receivables.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/app/receivables/${item.id}`}
                      className="flex items-center justify-between gap-3 px-3.5 py-3 text-sm transition-colors hover:bg-[var(--color-surface-subtle)]"
                    >
                      <span className="font-medium tabular-nums text-[var(--color-ink)]">
                        {formatBRL(item.amount_cents)}
                      </span>
                      <Badge tone={receivableStatusTone(item.status)}>
                        {receivableStatusLabel(item.status)}
                      </Badge>
                      <span className="text-[var(--color-ink-muted)]">vence {formatDateBR(item.due_on)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : (
        <div className="space-y-3">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}
    </div>
  );
}
