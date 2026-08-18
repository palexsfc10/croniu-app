"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BackLink } from "@/components/app/back-link";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { apiFetch, formatBRL } from "@/lib/api";
import type { BillingCheckout, BillingEntitlement } from "@/lib/billing";
import {
  CHECKOUT_TEMPORARY_ERROR,
  CHECKOUT_VERIFYING,
  isAllowedAsaasCheckoutUrl,
  sanitizeBillingErrorMessage,
} from "@/lib/billing-errors";
import {
  paymentStatusLabel,
  subscriptionStatusLabel,
  trialRemainingLabel,
} from "@/lib/billing-labels";

function setupLabel(status: string) {
  switch (status) {
    case "paid":
      return "Assinatura ativa";
    case "subscription_prepared":
      return "Assinatura preparada — aguardando confirmação do pagamento";
    case "checkout_pending":
      return "Checkout em andamento";
    case "checkout_failed":
      return "Checkout não concluído";
    case "checkout_expired":
      return "Checkout expirado";
    default:
      return "Plano disponível";
  }
}

export default function BillingPage() {
  const [ent, setEnt] = useState<BillingEntitlement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [form, setForm] = useState({
    cpf_cnpj: "",
    phone: "",
    postal_code: "",
    address: "",
    address_number: "",
    province: "",
    complement: "",
  });

  async function load() {
    const result = await apiFetch<BillingEntitlement>("/api/v1/billing/entitlement");
    if (result.error) {
      setError(sanitizeBillingErrorMessage(result.error.message));
      return;
    }
    setEnt(result.data ?? null);
    setError(null);
  }

  useEffect(() => {
    // Initial entitlement fetch — same pattern as other app pages.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount load
    void load();
  }, []);

  async function startCheckout() {
    if (inFlight.current || busy) {
      setError(CHECKOUT_VERIFYING);
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await apiFetch<BillingCheckout>("/api/v1/billing/checkout", {
        method: "POST",
        body: JSON.stringify({
          billing_method: "credit_card",
          customer: form,
        }),
      });
      if (result.error) {
        setError(sanitizeBillingErrorMessage(result.error.message) || CHECKOUT_TEMPORARY_ERROR);
        return;
      }
      const url = result.data?.checkout_url;
      if (url && isAllowedAsaasCheckoutUrl(url)) {
        window.location.href = url;
        return;
      }
      setError(CHECKOUT_TEMPORARY_ERROR);
      await load();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (!ent && !error) {
    return <p className="text-sm text-[var(--color-ink-muted)]">Carregando assinatura…</p>;
  }

  const amount = ent?.amount_cents ?? 2990;
  const cardOn = Boolean(ent?.card_enabled);
  const canResume = Boolean(ent?.can_resume_checkout && ent.resume_checkout_url);
  const canStart = Boolean(ent?.can_start_checkout && cardOn);
  const trialLabel = trialRemainingLabel(ent?.trial_days_remaining);
  const isTrial = (ent?.subscription_status || "").toLowerCase() === "trial";
  const resumeUrl =
    canResume && isAllowedAsaasCheckoutUrl(ent?.resume_checkout_url)
      ? ent!.resume_checkout_url!
      : null;

  return (
    <div className="mx-auto max-w-lg space-y-4 animate-fade-up">
      <BackLink href="/app/profile" label="Mais" />
      <div>
        <h1 className="h-display text-3xl text-[var(--color-ink)]">Assinatura</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Croniu · plano mensal {formatBRL(amount)} · trial de 7 dias.
        </p>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-[var(--radius-md)] bg-[var(--color-danger-subtle)] px-3 py-2 text-sm text-[var(--color-danger)]"
        >
          {error}
        </p>
      ) : null}

      {ent ? (
        <section className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <p className="text-sm font-semibold text-[var(--color-ink)]">
            {isTrial
              ? subscriptionStatusLabel(ent.subscription_status)
              : setupLabel(ent.billing_setup_status)}
          </p>
          <p className="text-sm text-[var(--color-ink-muted)]">
            {subscriptionStatusLabel(ent.subscription_status)}
            {isTrial && trialLabel ? ` · ${trialLabel}` : ""}
          </p>
          <p className="text-sm text-[var(--color-ink-muted)]">
            Pagamento · {paymentStatusLabel(ent.payment_status, ent.subscription_status)}
          </p>
          {!cardOn ? (
            <p className="text-sm text-[var(--color-warning)]">{CHECKOUT_TEMPORARY_ERROR}</p>
          ) : null}
        </section>
      ) : null}

      {ent?.referral_active && ent.referral_base_amount_cents ? (
        <section className="space-y-1.5 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-[var(--color-ink-muted)]">Plano Croniu</span>
            <span>{formatBRL(ent.referral_base_amount_cents)}/mês</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-[var(--color-ink-muted)]">
              Desconto vitalício de indicação
            </span>
            <span className="text-[var(--color-success,#16a34a)]">
              −{formatBRL(ent.referral_base_amount_cents - amount)}
            </span>
          </div>
          <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-1.5 text-sm font-semibold">
            <span>Total</span>
            <span>{formatBRL(amount)}/mês</span>
          </div>
          <p className="pt-1 text-xs text-[var(--color-ink-muted)]">
            Seu desconto permanece vinculado a esta conta enquanto você utilizar o Croniu.
          </p>
        </section>
      ) : null}

      {resumeUrl ? (
        <a href={resumeUrl} className="block">
          <Button fullWidth>Continuar checkout</Button>
        </a>
      ) : null}

      {canStart ? (
        <form
          className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void startCheckout();
          }}
        >
          <p className="text-sm font-semibold">Dados para o checkout Asaas</p>
          <TextField
            label="CPF/CNPJ"
            value={form.cpf_cnpj}
            onChange={(e) => setForm({ ...form, cpf_cnpj: e.target.value })}
            required
            disabled={busy}
          />
          <TextField
            label="Telefone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            required
            disabled={busy}
          />
          <TextField
            label="CEP"
            value={form.postal_code}
            onChange={(e) => setForm({ ...form, postal_code: e.target.value })}
            required
            disabled={busy}
          />
          <TextField
            label="Endereço"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            required
            disabled={busy}
          />
          <TextField
            label="Número"
            value={form.address_number}
            onChange={(e) => setForm({ ...form, address_number: e.target.value })}
            required
            disabled={busy}
          />
          <TextField
            label="Bairro"
            value={form.province}
            onChange={(e) => setForm({ ...form, province: e.target.value })}
            required
            disabled={busy}
          />
          <TextField
            label="Complemento"
            value={form.complement}
            onChange={(e) => setForm({ ...form, complement: e.target.value })}
            disabled={busy}
          />
          <Button fullWidth type="submit" disabled={busy}>
            {busy ? "Abrindo checkout…" : `Assinar por ${formatBRL(amount)}/mês`}
          </Button>
        </form>
      ) : null}

      <Link href="/app" className="text-sm font-semibold text-[var(--color-link)]">
        Voltar ao Hoje
      </Link>
    </div>
  );
}
