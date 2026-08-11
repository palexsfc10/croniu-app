"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BackLink } from "@/components/app/back-link";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { apiFetch } from "@/lib/api";
import type { BillingCheckout, BillingEntitlement } from "@/lib/billing";
import { formatBRL } from "@/lib/api";

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
      setError(result.error.message);
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
    setBusy(true);
    setError(null);
    const result = await apiFetch<BillingCheckout>("/api/v1/billing/checkout", {
      method: "POST",
      body: JSON.stringify({
        billing_method: "credit_card",
        customer: form,
      }),
    });
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    const url = result.data?.checkout_url;
    if (url) {
      window.location.href = url;
      return;
    }
    setError("Checkout criado sem URL. Tente novamente.");
    await load();
  }

  if (!ent && !error) {
    return <p className="text-sm text-[var(--color-ink-muted)]">Carregando assinatura…</p>;
  }

  const amount = ent?.amount_cents ?? 2990;
  const cardOn = Boolean(ent?.card_enabled);
  const canResume = Boolean(ent?.can_resume_checkout && ent.resume_checkout_url);
  const canStart = Boolean(ent?.can_start_checkout && cardOn);

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
        <p role="alert" className="rounded-[var(--radius-md)] bg-[var(--color-danger-subtle)] px-3 py-2 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}

      {ent ? (
        <section className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <p className="text-sm font-semibold text-[var(--color-ink)]">
            {setupLabel(ent.billing_setup_status)}
          </p>
          <p className="text-sm text-[var(--color-ink-muted)]">
            Status · {ent.subscription_status}
            {ent.trial_days_remaining != null
              ? ` · ${ent.trial_days_remaining} dia(s) de trial restantes`
              : ""}
          </p>
          <p className="text-sm text-[var(--color-ink-muted)]">
            Pagamento · {ent.payment_status || "none"}
          </p>
          {!cardOn ? (
            <p className="text-sm text-[var(--color-warning)]">
              Checkout com cartão ainda não está liberado neste ambiente. Em breve você
              poderá assinar por aqui.
            </p>
          ) : null}
        </section>
      ) : null}

      {canResume ? (
        <a href={ent!.resume_checkout_url!} className="block">
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
          />
          <TextField
            label="Telefone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            required
          />
          <TextField
            label="CEP"
            value={form.postal_code}
            onChange={(e) => setForm({ ...form, postal_code: e.target.value })}
            required
          />
          <TextField
            label="Endereço"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            required
          />
          <TextField
            label="Número"
            value={form.address_number}
            onChange={(e) => setForm({ ...form, address_number: e.target.value })}
            required
          />
          <TextField
            label="Bairro"
            value={form.province}
            onChange={(e) => setForm({ ...form, province: e.target.value })}
            required
          />
          <TextField
            label="Complemento"
            value={form.complement}
            onChange={(e) => setForm({ ...form, complement: e.target.value })}
          />
          <Button fullWidth type="submit" disabled={busy}>
            {busy ? "Abrindo checkout…" : "Assinar com cartão"}
          </Button>
        </form>
      ) : null}

      <Link href="/app" className="text-sm font-semibold text-[var(--color-link)]">
        Voltar ao Hoje
      </Link>
    </div>
  );
}
