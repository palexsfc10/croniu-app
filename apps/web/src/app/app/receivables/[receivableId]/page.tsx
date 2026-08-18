"use client";

import { BackLink } from "@/components/app/back-link";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch, formatBRL, formatDateBR, type Receivable } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ContextualBar } from "@/components/app/contextual-bar";
import { TextField } from "@/components/ui/text-field";
import { receivableStatusLabel, receivableStatusTone } from "@/lib/status-tone";

export default function ReceivableDetailPage() {
  const params = useParams<{ receivableId: string }>();
  const router = useRouter();
  const [item, setItem] = useState<Receivable | null>(null);
  const [method, setMethod] = useState("pix");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await apiFetch<Receivable>(`/api/v1/receivables/${params.receivableId}`);
      if (cancelled) return;
      if (result.error) setError(result.error.message);
      else setItem(result.data ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [params.receivableId]);

  async function markPaid() {
    if (!item) return;
    setBusy(true);
    setError(null);
    const result = await apiFetch<Receivable>(`/api/v1/receivables/${item.id}/mark-paid`, {
      method: "POST",
      body: JSON.stringify({ payment_method: method }),
    });
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setItem(result.data ?? null);
    router.refresh();
  }

  return (
    <div className="space-y-4 animate-fade-up">
      <ContextualBar label={item ? `Recebimento · ${item.client_name}` : null} />
      <BackLink href="/app" label="Hoje" />
      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
      {item ? (
        <>
          <h1 className="h-display text-3xl text-[var(--color-ink)]">{item.client_name}</h1>
          <p className="text-sm text-[var(--color-ink-muted)]">{item.cycle_service_name}</p>
          <p className="text-lg font-semibold">{formatBRL(item.amount_cents)}</p>
          <p className="flex flex-wrap items-center gap-2 text-sm">
            Status:
            <Badge tone={receivableStatusTone(item.status)}>
              {receivableStatusLabel(item.status)}
            </Badge>
          </p>
          <p className="text-sm text-[var(--color-ink-muted)]">
            Vencimento: {formatDateBR(item.due_on)}
          </p>
          {item.status !== "received" ? (
            <div className="space-y-3">
              <TextField
                label="Forma de pagamento"
                value={method}
                onChange={(event) => setMethod(event.target.value)}
              />
              <Button variant="success" fullWidth disabled={busy} onClick={() => void markPaid()}>
                {busy ? "Confirmando…" : "Marcar como pago"}
              </Button>
            </div>
          ) : (
            <p className="rounded-[var(--radius-md)] border border-[var(--color-success)]/20 bg-[var(--color-success-subtle)] px-3 py-2 text-sm text-[var(--color-success)]">
              Recebido em {item.paid_at ? new Date(item.paid_at).toLocaleString("pt-BR") : "—"}
              {item.payment_method ? ` · ${item.payment_method}` : ""}
            </p>
          )}
          <Link href={`/app/cycles/${item.cycle_id}`} className="text-sm font-semibold text-[var(--color-link)]">
            Ver ciclo
          </Link>
        </>
      ) : (
        <p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p>
      )}
    </div>
  );
}
