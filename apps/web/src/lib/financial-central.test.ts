import { describe, expect, it } from "vitest";
import {
  isReceivableUpcoming,
  matchesReceivableView,
  receivableActionLabel,
} from "@/lib/financial-central";
import type { Receivable } from "@/lib/api";

const TODAY = "2026-09-10";

function receivable(over: Partial<Receivable> = {}): Receivable {
  return {
    id: "r1",
    cycle_id: "cy1",
    client_id: "cl1",
    amount_cents: 9000,
    due_on: "2026-09-12",
    status: "pending",
    paid_at: null,
    payment_method: null,
    notes: null,
    created_at: "",
    updated_at: "",
    client_name: "Ana",
    cycle_service_name: "Aula",
    ...over,
  } as Receivable;
}

describe("isReceivableUpcoming — janela de 7 dias, nunca vencido, nunca zero", () => {
  it("is true for a pending real-value receivable due within 7 days", () => {
    expect(isReceivableUpcoming(receivable({ due_on: "2026-09-12" }), TODAY)).toBe(true);
    expect(isReceivableUpcoming(receivable({ due_on: TODAY }), TODAY)).toBe(true);
  });

  it("is false once the due date is more than 7 days out", () => {
    expect(isReceivableUpcoming(receivable({ due_on: "2026-09-20" }), TODAY)).toBe(false);
  });

  it("is false for an already-overdue receivable — that is a different bucket", () => {
    expect(isReceivableUpcoming(receivable({ due_on: "2026-09-01" }), TODAY)).toBe(false);
  });

  it("is false for a R$0,00 receivable even if due within the window", () => {
    expect(isReceivableUpcoming(receivable({ amount_cents: 0, due_on: "2026-09-11" }), TODAY)).toBe(
      false,
    );
  });

  it("is false once the receivable is received or cancelled", () => {
    expect(isReceivableUpcoming(receivable({ status: "received" }), TODAY)).toBe(false);
    expect(isReceivableUpcoming(receivable({ status: "cancelled" }), TODAY)).toBe(false);
  });
});

describe("matchesReceivableView", () => {
  it("separates overdue, upcoming and the broader pending bucket", () => {
    const overdue = receivable({ due_on: "2026-09-01" });
    const upcoming = receivable({ due_on: "2026-09-12" });
    const farOut = receivable({ due_on: "2026-11-01" });
    expect(matchesReceivableView(overdue, "overdue", TODAY)).toBe(true);
    expect(matchesReceivableView(overdue, "upcoming", TODAY)).toBe(false);
    expect(matchesReceivableView(upcoming, "upcoming", TODAY)).toBe(true);
    expect(matchesReceivableView(upcoming, "overdue", TODAY)).toBe(false);
    expect(matchesReceivableView(farOut, "pending", TODAY)).toBe(true);
    expect(matchesReceivableView(farOut, "upcoming", TODAY)).toBe(false);
  });

  it("never counts a R$0,00 row as pending/overdue/upcoming in any view", () => {
    const free = receivable({ amount_cents: 0, due_on: "2026-09-01" });
    expect(matchesReceivableView(free, "pending", TODAY)).toBe(false);
    expect(matchesReceivableView(free, "overdue", TODAY)).toBe(false);
    expect(matchesReceivableView(free, "upcoming", TODAY)).toBe(false);
    // Still visible under "all" — it is not deleted, just non-actionable.
    expect(matchesReceivableView(free, "all", TODAY)).toBe(true);
  });

  it("matches received and cancelled by their real status alone", () => {
    expect(matchesReceivableView(receivable({ status: "received" }), "received", TODAY)).toBe(true);
    expect(matchesReceivableView(receivable({ status: "cancelled" }), "cancelled", TODAY)).toBe(true);
    expect(matchesReceivableView(receivable({ status: "received" }), "pending", TODAY)).toBe(false);
  });
});

describe("receivableActionLabel — nunca uma ação que a API não suporta", () => {
  it("offers to register payment only for a real, unpaid pending charge", () => {
    expect(receivableActionLabel(receivable())).toBe("Registrar pagamento");
    expect(receivableActionLabel(receivable({ amount_cents: 0 }))).not.toBe("Registrar pagamento");
    expect(receivableActionLabel(receivable({ status: "received" }))).not.toBe(
      "Registrar pagamento",
    );
    expect(receivableActionLabel(receivable({ status: "cancelled" }))).not.toBe(
      "Registrar pagamento",
    );
  });
});
