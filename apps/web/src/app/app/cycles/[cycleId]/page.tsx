"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  apiFetch,
  formatBRL,
  type Cycle,
  type Receivable,
  type WhatsAppPrep,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ContextualBar } from "@/components/app/contextual-bar";

export default function CycleDetailPage() {
  const params = useParams<{ cycleId: string }>();
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

  return (
    <div className="space-y-4 animate-fade-up">
      <ContextualBar
        label={cycle ? `Ciclo · ${cycle.client_name} · ${cycle.service_name}` : null}
      />
      <Link href="/app/cycles" className="text-sm font-semibold text-[var(--color-ink-muted)]">
        Voltar
      </Link>
      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
      {cycle ? (
        <>
          <h1 className="h-display text-3xl text-[var(--color-ink)]">{cycle.client_name}</h1>
          <p className="text-sm text-[var(--color-ink-muted)]">
            {cycle.service_name} · {cycle.starts_on} → {cycle.ends_on}
            {cycle.is_legacy ? " · ciclo legado" : ""}
          </p>
          {cycle.lesson_count != null ? (
            <p className="text-sm">
              {cycle.lesson_count} aulas · {formatBRL(cycle.unit_price_cents)} / aula
            </p>
          ) : null}
          {cycle.subtotal_cents != null ? (
            <p className="text-sm text-[var(--color-ink-muted)]">
              Subtotal {formatBRL(cycle.subtotal_cents)}
              {cycle.adjustment_cents
                ? ` · ajuste ${formatBRL(cycle.adjustment_cents)}`
                : ""}
            </p>
          ) : null}
          <p className="text-sm font-semibold">Total: {formatBRL(cycle.value_cents)}</p>
          {!cycle.is_legacy ? (
            <p className="text-sm text-[var(--color-ink-muted)]">
              Edição financeira disponível via API; sincronizar agenda futura ainda não altera
              compromissos existentes.
            </p>
          ) : null}
          {cycle.is_nearing_end ? (
            <p className="rounded-[var(--radius-md)] bg-[var(--color-surface-muted)] px-3 py-2 text-sm">
              Ciclo encerrando{cycle.days_remaining != null ? ` em ${cycle.days_remaining} dia(s)` : ""}.
            </p>
          ) : null}
          <div className="space-y-2">
            <Button fullWidth disabled={busy} onClick={() => void prepareWhatsApp()}>
              Preparar mensagem WhatsApp
            </Button>
            <Button fullWidth variant="secondary" disabled={busy} onClick={() => void confirmContact()}>
              Confirmar contato manualmente
            </Button>
          </div>
          {prep ? (
            <section className="space-y-2 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
              <h2 className="text-sm font-semibold">Mensagem pronta</h2>
              <p className="whitespace-pre-wrap text-sm text-[var(--color-ink-muted)]">{prep.message}</p>
              {prep.can_open_whatsapp && prep.wa_url ? (
                <a href={prep.wa_url} target="_blank" rel="noreferrer">
                  <Button fullWidth variant="secondary">
                    Abrir WhatsApp (sem envio automático)
                  </Button>
                </a>
              ) : (
                <p className="text-sm text-[var(--color-warning)]">
                  Cliente sem telefone — copie a mensagem e envie manualmente.
                </p>
              )}
            </section>
          ) : null}
          {cycle.contact_confirmed_at ? (
            <p className="text-sm text-[var(--color-success)]">
              Contato confirmado em {new Date(cycle.contact_confirmed_at).toLocaleString("pt-BR")}
            </p>
          ) : null}
          <section className="space-y-2">
            <h2 className="text-base font-semibold">Recebimentos</h2>
            {!receivables.length ? (
              <p className="text-sm text-[var(--color-ink-muted)]">Nenhum recebimento neste ciclo.</p>
            ) : null}
            <ul className="space-y-2">
              {receivables.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/app/receivables/${item.id}`}
                    className="block rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-sm"
                  >
                    {formatBRL(item.amount_cents)} · {item.status} · vence {item.due_on}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : (
        <p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p>
      )}
    </div>
  );
}
