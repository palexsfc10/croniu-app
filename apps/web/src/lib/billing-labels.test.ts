import { describe, expect, it } from "vitest";
import {
  paymentStatusLabel,
  subscriptionStatusLabel,
  trialRemainingLabel,
} from "@/lib/billing-labels";

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
