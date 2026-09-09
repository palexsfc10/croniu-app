"use client";

import { BackLink } from "@/components/app/back-link";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch, formatBRL, formatDateBR, type Receivable } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ContextualBar } from "@/components/app/contextual-bar";
import { TextField } from "@/components/ui/text-field";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockError } from "@/components/ui/block-error";
import { receivableStatusLabel, receivableStatusTone } from "@/lib/status-tone";
import { safeReturnTo } from "@/lib/nomenclature";

export default function ReceivableDetailPage() {
  const params = useParams<{ receivableId: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const returnTo = safeReturnTo(search.get("returnTo")) || "/app";
  const [item, setItem] = useState<Receivable | null>(null);
  const [method, setMethod] = useState("pix");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const result = await apiFetch<Receivable>(`/api/v1/receivables/${params.receivableId}`);
    if (result.error) setError(result.error.message);
    else setItem(result.data ?? null);
  }

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
      // Already paid (e.g. a stale double-click) — resync instead of
      // leaving the form stuck showing an action that no longer applies.
      if (result.error.code === "already_paid") await load();
      return;
    }
    setItem(result.data ?? null);
    router.refresh();
  }

  return (
    <div className="space-y-4 animate-fade-up">
      <ContextualBar label={item ? `Recebimento · ${item.client_name}` : null} />
      <BackLink href={returnTo} label={returnTo === "/app/receivables" ? "Financeiro" : "Início"} />
      {error ? <BlockError message={error} /> : null}
      {item ? (
        <>
          <header className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="h-display text-2xl text-[var(--color-ink)] md:text-3xl">
                {item.client_name}
              </h1>
              <Badge tone={receivableStatusTone(item.status)}>
                {receivableStatusLabel(item.status)}
              </Badge>
            </div>
            <p className="text-sm text-[var(--color-ink-muted)]">{item.cycle_service_name}</p>
          </header>

          <section className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3.5 shadow-sm">
            <p className="text-2xl font-semibold tabular-nums text-[var(--color-ink)]">
              {formatBRL(item.amount_cents)}
            </p>
            <p className="text-sm text-[var(--color-ink-muted)]">
              Vencimento: {formatDateBR(item.due_on)}
            </p>
          </section>

          {item.status !== "received" ? (
            <section className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3.5 shadow-sm">
              <TextField
                label="Forma de pagamento"
                value={method}
                onChange={(event) => setMethod(event.target.value)}
              />
              <Button variant="success" disabled={busy} onClick={() => void markPaid()}>
                {busy ? "Confirmando…" : "Marcar como pago"}
              </Button>
            </section>
          ) : (
            <p className="rounded-[var(--radius-lg)] border border-[var(--color-success)]/20 bg-[var(--color-success-subtle)] px-3.5 py-2.5 text-sm text-[var(--color-success)] shadow-sm">
              Recebido em {item.paid_at ? new Date(item.paid_at).toLocaleString("pt-BR") : "—"}
              {item.payment_method ? ` · ${item.payment_method}` : ""}
            </p>
          )}
          <Link href={`/app/cycles/${item.cycle_id}`} className="text-sm font-semibold text-[var(--color-link)] hover:underline">
            Ver ciclo
          </Link>
        </>
      ) : (
        <div className="space-y-3">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}
    </div>
  );
}
