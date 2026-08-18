/** Human-facing labels for billing entitlement (never show raw enums). */

import type { BillingEntitlement } from "@/lib/billing";

function formatDateTimeBR(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("pt-BR");
}

export function subscriptionStatusLabel(status: string | null | undefined): string {
  switch ((status || "").toLowerCase()) {
    case "trial":
      return "Teste grátis ativo";
    case "pending_payment_method":
    case "pending_activation":
    case "payment_pending":
      return "Pagamento pendente";
    case "active":
      return "Assinatura ativa";
    case "past_due":
    case "grace_period":
      return "Pagamento em atraso";
    case "suspended":
      return "Assinatura suspensa";
    case "cancelled":
      return "Assinatura cancelada";
    case "expired":
      return "Teste encerrado";
    case "incomplete":
    case "provider_error":
      return "Precisa de atenção";
    default:
      return "Situação da assinatura";
  }
}

export function paymentStatusLabel(
  paymentStatus: string | null | undefined,
  _subscriptionStatus?: string | null,
): string {
  const pay = (paymentStatus || "").toLowerCase().trim();

  if (!pay || pay === "none" || pay === "null" || pay === "undefined") {
    return "Nenhum pagamento realizado";
  }

  switch (pay) {
    case "scheduled":
      return "Cobrança agendada";
    case "pending":
      return "Pagamento pendente";
    case "confirmed":
    case "received":
    case "paid":
      return "Pagamento confirmado";
    case "overdue":
      return "Pagamento vencido";
    case "failed":
      return "Falha no pagamento";
    case "refunded":
      return "Pagamento reembolsado";
    case "cancelled":
    case "canceled":
      return "Cobrança cancelada";
    default:
      // Never echo opaque provider enums; keep generic.
      return "Situação de pagamento em atualização";
  }
}

export function trialRemainingLabel(days: number | null | undefined): string | null {
  if (days == null) return null;
  if (days <= 0) return null;
  if (days === 1) return "1 dia restante";
  return `${days} dias restantes`;
}

export type BillingStateView = {
  /** Short status headline. Never repeats the detail line. */
  headline: string;
  /** One explanatory line — distinct from the headline, never duplicated. */
  detail: string;
  /** When present, explains exactly when the next/first charge happens. */
  scheduleNote: string | null;
  /**
   * Shown only when no start/resume button is rendered, so the screen never
   * ends in silence — always states why and what happens next.
   */
  noActionNote: string | null;
};

/**
 * Single source of truth for the /app/billing state machine copy.
 *
 * Covers: trial ativo, trial expirado, checkout pendente, pagamento
 * confirmado (subscription_prepared), assinatura ativa, inadimplente
 * (past_due/grace_period), cancelada (agendada vs. encerrada), e
 * reativação (volta a trial/ativa — mesmos ramos de baixo).
 */
export function describeBillingState(ent: BillingEntitlement): BillingStateView {
  const status = (ent.subscription_status || "").toLowerCase();
  const setup = ent.billing_setup_status;
  const trialLabel = trialRemainingLabel(ent.trial_days_remaining);
  const trialEndsLabel = formatDateTimeBR(ent.trial_ends_at);
  const nextBillingLabel = formatDateTimeBR(ent.next_billing_at);
  const graceEndsLabel = formatDateTimeBR(ent.grace_period_ends_at);
  const cancellationLabel = formatDateTimeBR(ent.cancellation_effective_at);
  const checkoutExpiresLabel = formatDateTimeBR(ent.open_checkout_expires_at);

  // Pagamento confirmado durante o trial — assinatura garantida, mas a
  // primeira cobrança real só ocorre quando o trial terminar.
  if (setup === "subscription_prepared") {
    return {
      headline: "Assinatura confirmada",
      detail: trialLabel
        ? `Seu teste grátis continua ativo · ${trialLabel}.`
        : "Aguardando confirmação do pagamento.",
      scheduleNote: trialEndsLabel
        ? `Sua primeira cobrança ocorrerá em ${trialEndsLabel} — não cobramos antes do fim do teste.`
        : null,
      noActionNote: null,
    };
  }

  // Assinatura ativa (paga) — cobrança recorrente já em curso.
  if (setup === "paid" || status === "active") {
    return {
      headline: "Assinatura ativa",
      detail: "Pagamento em dia.",
      scheduleNote: nextBillingLabel ? `Próxima cobrança em ${nextBillingLabel}.` : null,
      noActionNote: null,
    };
  }

  // Checkout hospedado em andamento — retomar em vez de recomeçar.
  if (setup === "checkout_pending") {
    return {
      headline: "Checkout em andamento",
      detail: "Continue de onde parou para concluir a assinatura.",
      scheduleNote: checkoutExpiresLabel ? `Esse link expira em ${checkoutExpiresLabel}.` : null,
      noActionNote: null,
    };
  }

  // Inadimplente — pagamento em atraso, ainda dentro (ou não) do período de carência.
  if (status === "past_due" || status === "grace_period") {
    return {
      headline: "Pagamento em atraso",
      detail: graceEndsLabel
        ? `Regularize até ${graceEndsLabel} para evitar a suspensão do acesso.`
        : "Regularize o pagamento para evitar a suspensão do acesso.",
      scheduleNote: null,
      noActionNote:
        "Ainda não é possível atualizar o cartão por aqui. Entre em contato com o suporte para regularizar.",
    };
  }

  if (status === "suspended") {
    return {
      headline: "Assinatura suspensa",
      detail: "O acesso de escrita está bloqueado até a regularização do pagamento.",
      scheduleNote: null,
      noActionNote: "Entre em contato com o suporte para reativar sua assinatura.",
    };
  }

  // Cancelada — mas ainda com acesso agendado até o fim do período já pago.
  if (status === "cancelled") {
    if (cancellationLabel) {
      return {
        headline: "Assinatura cancelada",
        detail: `Seu acesso continua disponível até ${cancellationLabel}.`,
        scheduleNote: "Você pode assinar novamente a qualquer momento antes ou depois dessa data.",
        noActionNote: null,
      };
    }
    return {
      headline: "Assinatura cancelada",
      detail: "Assine novamente para voltar a editar seus dados.",
      scheduleNote: null,
      noActionNote: null,
    };
  }

  // Trial expirado (ou qualquer outro bloqueio de escrita) sem assinatura.
  if (status === "expired" || ent.blocking_reason === "trial_expired") {
    return {
      headline: "Teste encerrado",
      detail: "Seus dados estão preservados. Assine para continuar editando.",
      scheduleNote: null,
      noActionNote: null,
    };
  }

  if (status === "incomplete" || status === "provider_error") {
    return {
      headline: "Precisa de atenção",
      detail: "Não conseguimos confirmar sua assinatura automaticamente.",
      scheduleNote: null,
      noActionNote: "Entre em contato com o suporte para resolver.",
    };
  }

  // Trial ativo (estado inicial padrão, inclui pending_payment_method) —
  // contratação é sempre uma ação voluntária do usuário.
  return {
    headline: "Teste grátis ativo",
    detail: trialLabel ? `${trialLabel} para experimentar o Croniu sem custo.` : "Aproveite o teste gratuito.",
    scheduleNote: trialEndsLabel
      ? `Se você assinar agora, a primeira cobrança só ocorre em ${trialEndsLabel} — nunca durante o teste.`
      : null,
    noActionNote: null,
  };
}
