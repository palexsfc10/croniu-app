import { describe, expect, it } from "vitest";
import {
  describeBillingState,
  paymentStatusLabel,
  subscriptionStatusLabel,
  trialRemainingLabel,
} from "@/lib/billing-labels";
import type { BillingEntitlement } from "@/lib/billing";

function ent(overrides: Partial<BillingEntitlement>): BillingEntitlement {
  return {
    subscription_status: "trial",
    billing_setup_status: "available",
    has_active_access: true,
    can_write: true,
    ...overrides,
  };
}

describe("billing-labels", () => {
  it("labels active trial without technical payment enums", () => {
    expect(subscriptionStatusLabel("trial")).toBe("Teste grátis ativo");
    expect(paymentStatusLabel("none", "trial")).toBe("Nenhum pagamento realizado");
    expect(paymentStatusLabel("none", "trial").toLowerCase()).not.toContain("none");
    expect(paymentStatusLabel(null, "trial").toLowerCase()).not.toContain("null");
  });

  it("labels pending and confirmed payment", () => {
    expect(paymentStatusLabel("pending")).toBe("Pagamento pendente");
    expect(paymentStatusLabel("confirmed")).toBe("Pagamento confirmado");
    expect(paymentStatusLabel("overdue")).toBe("Pagamento vencido");
  });

  it("formats remaining trial days", () => {
    expect(trialRemainingLabel(7)).toBe("7 dias restantes");
    expect(trialRemainingLabel(1)).toBe("1 dia restante");
    expect(trialRemainingLabel(0)).toBeNull();
  });

  it("never echoes unknown raw enums", () => {
    const label = paymentStatusLabel("SOME_PROVIDER_ENUM");
    expect(label.toLowerCase()).not.toContain("some_provider_enum");
  });
});

describe("describeBillingState — máquina de estados de /app/billing", () => {
  it("trial ativo: convida a assinar e explica quando a 1ª cobrança ocorre", () => {
    const view = describeBillingState(
      ent({
        subscription_status: "trial",
        billing_setup_status: "available",
        trial_days_remaining: 5,
        trial_ends_at: "2026-08-25T12:00:00Z",
        recommended_action: "subscribe",
      }),
    );
    expect(view.headline).toBe("Teste grátis ativo");
    expect(view.detail).not.toBe(view.headline);
    expect(view.detail.toLowerCase()).toContain("dias");
    expect(view.scheduleNote).toMatch(/primeira cobrança/i);
    expect(view.scheduleNote).toMatch(/25\/08\/2026/);
    expect(view.noActionNote).toBeNull();
  });

  it("trial expirado: pede assinatura sem repetir o texto do detalhe", () => {
    const view = describeBillingState(
      ent({
        subscription_status: "expired",
        billing_setup_status: "available",
        blocking_reason: "trial_expired",
        recommended_action: "subscribe",
      }),
    );
    expect(view.headline).toBe("Teste encerrado");
    expect(view.detail).not.toBe(view.headline);
    expect(view.detail.toLowerCase()).toContain("assine");
  });

  it("checkout pendente: convida a retomar e mostra a expiração", () => {
    const view = describeBillingState(
      ent({
        subscription_status: "pending_payment_method",
        billing_setup_status: "checkout_pending",
        open_checkout_expires_at: "2026-08-19T12:00:00Z",
      }),
    );
    expect(view.headline).toBe("Checkout em andamento");
    expect(view.scheduleNote).toMatch(/expira/i);
  });

  it("pagamento confirmado durante o trial: explica a data da cobrança real", () => {
    const view = describeBillingState(
      ent({
        subscription_status: "trial",
        billing_setup_status: "subscription_prepared",
        trial_days_remaining: 3,
        trial_ends_at: "2026-08-25T12:00:00Z",
      }),
    );
    expect(view.headline).toBe("Assinatura confirmada");
    expect(view.detail).not.toBe(view.headline);
    expect(view.scheduleNote).toMatch(/não cobramos antes/i);
  });

  it("assinatura ativa: mostra a próxima cobrança, não o trial", () => {
    const view = describeBillingState(
      ent({
        subscription_status: "active",
        billing_setup_status: "paid",
        next_billing_at: "2026-09-18T12:00:00Z",
      }),
    );
    expect(view.headline).toBe("Assinatura ativa");
    expect(view.scheduleNote).toMatch(/próxima cobrança/i);
    expect(view.scheduleNote).toMatch(/18\/09\/2026/);
  });

  it("inadimplente: explica o prazo de regularização e não finge ter um botão", () => {
    const view = describeBillingState(
      ent({
        subscription_status: "past_due",
        billing_setup_status: "available",
        grace_period_ends_at: "2026-08-21T12:00:00Z",
      }),
    );
    expect(view.headline).toBe("Pagamento em atraso");
    expect(view.detail).toMatch(/21\/08\/2026/);
    expect(view.noActionNote).toMatch(/suporte/i);
  });

  it("cancelada com acesso agendado: informa até quando o acesso continua", () => {
    const view = describeBillingState(
      ent({
        subscription_status: "cancelled",
        billing_setup_status: "available",
        cancellation_effective_at: "2026-09-01T12:00:00Z",
      }),
    );
    expect(view.headline).toBe("Assinatura cancelada");
    expect(view.detail).toMatch(/01\/09\/2026/);
  });

  it("cancelada e encerrada (reativação): convida a assinar de novo", () => {
    const view = describeBillingState(
      ent({
        subscription_status: "cancelled",
        billing_setup_status: "available",
        cancellation_effective_at: null,
      }),
    );
    expect(view.headline).toBe("Assinatura cancelada");
    expect(view.detail.toLowerCase()).toContain("assine novamente");
  });

  it("nunca repete a mesma frase entre headline e detail em nenhum estado conhecido", () => {
    const statuses = [
      "trial",
      "expired",
      "active",
      "past_due",
      "grace_period",
      "suspended",
      "cancelled",
      "incomplete",
      "provider_error",
    ];
    for (const subscription_status of statuses) {
      const view = describeBillingState(ent({ subscription_status }));
      expect(view.detail).not.toBe(view.headline);
    }
  });
});
