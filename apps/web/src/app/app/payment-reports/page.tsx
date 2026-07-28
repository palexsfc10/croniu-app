"use client";

import { BackLink } from "@/components/app/back-link";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch, formatBRL } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";

type Report = {
  id: string;
  client_name?: string | null;
  amount_cents: number;
  status: string;
  method_note?: string | null;
  notes?: string | null;
  has_proof?: boolean;
};

export default function PaymentReportsPage() {
  const [items, setItems] = useState<Report[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await apiFetch<Report[]>("/api/v1/payment-reports?status=pending_review");
      if (cancelled) return;
      if (res.error) setError(res.error.message);
      else setItems(res.data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function reload() {
    const res = await apiFetch<Report[]>("/api/v1/payment-reports?status=pending_review");
    if (res.error) setError(res.error.message);
    else setItems(res.data ?? []);
  }

  async function confirm(id: string) {
    const res = await apiFetch(`/api/v1/payment-reports/${id}/confirm`, {
      method: "POST",
      body: "{}",
    });
    if (res.error) {
      setError(res.error.message);
      return;
    }
    await reload();
  }

  async function reject(id: string) {
    const res = await apiFetch(`/api/v1/payment-reports/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason: reason[id] || null }),
    });
    if (res.error) {
      setError(res.error.message);
      return;
    }
    await reload();
  }

  return (
    <div className="space-y-4 animate-fade-up">
      <BackLink href="/app" label="Hoje" />
      <h1 className="h-display text-3xl text-[var(--color-ink)]">Pagamentos informados</h1>
      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
      {items === null ? (
        <p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p>
      ) : !items.length ? (
        <p className="text-sm text-[var(--color-ink-muted)]">Nenhum informe aguardando.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="space-y-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
            >
              <p className="font-semibold">{item.client_name}</p>
              <p className="text-sm text-[var(--color-ink-muted)]">
                {formatBRL(item.amount_cents)}
                {item.method_note ? ` · ${item.method_note}` : ""}
              </p>
              {item.notes ? <p className="text-sm">{item.notes}</p> : null}
              {item.has_proof ? (
                <a
                  className="text-sm font-semibold text-[var(--color-primary)]"
                  href={`/api/v1/payment-reports/${item.id}/proof`}
                >
                  Baixar comprovante
                </a>
              ) : null}
              <Button fullWidth onClick={() => void confirm(item.id)}>
                Confirmar pagamento
              </Button>
              <TextField
                label="Motivo da rejeição (opcional)"
                value={reason[item.id] ?? ""}
                onChange={(e) => setReason((prev) => ({ ...prev, [item.id]: e.target.value }))}
              />
              <Button variant="secondary" fullWidth onClick={() => void reject(item.id)}>
                Rejeitar
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
