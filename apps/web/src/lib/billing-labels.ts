/** Human-facing labels for billing entitlement (never show raw enums). */

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
