"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import type { BillingEntitlement } from "@/lib/billing";
import {
  paymentStatusLabel,
  subscriptionStatusLabel,
} from "@/lib/billing-labels";

const POLL_INTERVAL_MS = 4000;
const POLL_MAX_MS = 90_000;

/**
 * Success callback alone never proves payment — we poll entitlement.
 */
export default function BillingReturnPage() {
  const params = useParams<{ mode: string }>();
  const mode = (params.mode || "success") as "success" | "cancel" | "expired";
  const [ent, setEnt] = useState<BillingEntitlement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [loading, setLoading] = useState(true);
  const startedAt = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.search) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      const result = await apiFetch<BillingEntitlement>("/api/v1/billing/entitlement");
      if (cancelled) return;
      if (result.error) {
        setError(result.error.message);
        setLoading(false);
        return;
      }
      const data = result.data!;
      setEnt(data);
      setLoading(false);

      const setup = data.billing_setup_status;
      const paid =
        data.subscription_status === "active" ||
        data.payment_status === "confirmed" ||
        data.payment_status === "received" ||
        setup === "paid";
      const prepared = setup === "subscription_prepared" || Boolean(data.payment_prepared);

      if (mode === "success") {
        if (paid || prepared) return;
        const start = startedAt.current ?? Date.now();
        if (Date.now() - start >= POLL_MAX_MS) {
          setTimedOut(true);
          return;
        }
        timerRef.current = window.setTimeout(() => {
          void tick();
        }, POLL_INTERVAL_MS);
      }
    }

    void tick();
    return () => {
      cancelled = true;
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [mode]);

  const title =
    mode === "cancel"
      ? "Checkout cancelado"
      : mode === "expired"
        ? "Checkout expirado"
        : "Confirmando pagamento";

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-8">
      <h1 className="h-display text-3xl text-[var(--color-ink)]">{title}</h1>
      {loading ? (
        <p className="text-sm text-[var(--color-ink-muted)]">Consultando sua assinatura…</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
      {mode === "success" && timedOut ? (
        <p className="text-sm text-[var(--color-warning)]">
          Ainda não recebemos a confirmação do pagamento. Isso pode demorar alguns minutos
          (webhook). Você pode voltar e atualizar a assinatura.
        </p>
      ) : null}
      {ent ? (
        <p className="text-sm text-[var(--color-ink-muted)]">
          {subscriptionStatusLabel(ent.subscription_status)} ·{" "}
          {paymentStatusLabel(ent.payment_status, ent.subscription_status)}
        </p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Link href="/app/billing">
          <Button fullWidth>Ver assinatura</Button>
        </Link>
        <Link href="/app">
          <Button fullWidth variant="secondary">
            Ir para o Hoje
          </Button>
        </Link>
      </div>
    </div>
  );
}
