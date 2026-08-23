import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { withCycleCreatedMarker } from "./page";

const nav = vi.hoisted(() => ({
  query: "clientId=c1&serviceId=s1&templateId=t1&returnTo=%2Fapp%2Fclients%2Fc1%3Ftab%3Dacompanhamento",
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.query),
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ me: { organization: { timezone: "America/Sao_Paulo" } } }),
}));

const CLIENT = { id: "c1", full_name: "Aluna Teste", phone: null, email: null, notes: null, status: "active", created_at: "", updated_at: "" };
const SERVICE = {
  id: "s1",
  name: "Personal",
  description: null,
  default_duration_days: 30,
  default_duration_minutes: 60,
  default_price_cents: 10000,
  status: "active",
  created_at: "",
  updated_at: "",
};
const TEMPLATE = {
  id: "t1",
  name: "1x/semana",
  weekly_frequency: 1,
  duration_type: "calendar_months",
  duration_value: 1,
  status: "active",
  created_at: "",
  updated_at: "",
  duration_label: "1 mês",
};

let intelligentCalls: Array<Record<string, unknown>> = [];
let intelligentResult: { error?: { message: string; code?: string; details?: unknown } } = {};

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    apiFetch: vi.fn(async (path: string, init?: { method?: string; body?: string }) => {
      if (path === "/api/v1/clients?status=active") return { data: [CLIENT] };
      if (path === "/api/v1/services?status=active") return { data: [SERVICE] };
      if (path === "/api/v1/cycle-templates?status=active") return { data: [TEMPLATE] };
      if (path === "/api/v1/locations?status=active") return { data: [] };
      if (path === "/api/v1/cycles/preview") {
        return {
          data: {
            starts_on: "2026-09-01",
            ends_on: "2026-09-30",
            weekdays: [0],
            lesson_dates: ["2026-09-07"],
            lesson_count: 4,
            unit_price_cents: 10000,
            subtotal_cents: 40000,
            adjustment_cents: 0,
            final_cents: 40000,
            lesson_duration_minutes: 60,
            duration_type: "calendar_months",
            duration_value: 1,
            weekly_frequency: 1,
          },
        };
      }
      if (path === "/api/v1/cycles/intelligent") {
        intelligentCalls.push(JSON.parse(init?.body as string));
        if (intelligentResult.error) return { error: intelligentResult.error };
        return {
          data: {
            id: "cy-new",
            client_id: "c1",
            service_id: "s1",
            cycle_type: "period",
            status: "active",
            starts_on: "2026-09-01",
            ends_on: "2026-09-30",
            notes: null,
            last_contacted_at: null,
            contact_confirmed_at: null,
            created_at: "",
            updated_at: "",
            client_name: "Aluna Teste",
            service_name: "Personal",
            days_remaining: 30,
            is_nearing_end: false,
            value_cents: 40000,
          },
        };
      }
      return { data: null };
    }),
  };
});

import NewCyclePage from "./page";

async function goToConfirmStep() {
  render(<NewCyclePage />);
  fireEvent.click(await screen.findByRole("button", { name: "Continuar" }));
  fireEvent.change(screen.getByLabelText("Data de início do ciclo"), {
    target: { value: "2026-09-01" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Seg" }));
  fireEvent.click(screen.getByRole("button", { name: "Calcular aulas" }));
  await screen.findByRole("button", { name: "Confirmar ciclo" });
}

describe("Novo ciclo — redirect after success", () => {
  beforeEach(() => {
    intelligentCalls = [];
    intelligentResult = {};
    nav.replace.mockClear();
    nav.query =
      "clientId=c1&serviceId=s1&templateId=t1&returnTo=%2Fapp%2Fclients%2Fc1%3Ftab%3Dacompanhamento";
  });

  it("does not corrupt a returnTo that already carries a query string", () => {
    // The historical bug: `${returnTo}?done=cycle` produced a second "?",
    // which made `tab` resolve to the literal string "acompanhamento?done=cycle".
    expect(withCycleCreatedMarker("/app/clients/c1?tab=acompanhamento")).toBe(
      "/app/clients/c1?tab=acompanhamento&done=cycle",
    );
    expect(withCycleCreatedMarker("/app/cycles/cy-new")).toBe("/app/cycles/cy-new?done=cycle");
  });

  it("redirects to the same student's accompaniment tab — not a generic route — with the done marker", async () => {
    await goToConfirmStep();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar ciclo" }));

    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    const target = nav.replace.mock.calls[0][0] as string;
    expect(target).toBe("/app/clients/c1?tab=acompanhamento&done=cycle");
    expect(intelligentCalls).toHaveLength(1);
    expect(intelligentCalls[0].client_id).toBe("c1");
  });

  it("falls back to the client's accompaniment tab (not the cycle detail page) when returnTo is absent", async () => {
    nav.query = "clientId=c1&serviceId=s1&templateId=t1";
    await goToConfirmStep();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar ciclo" }));

    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    expect(nav.replace.mock.calls[0][0]).toBe("/app/clients/c1?tab=acompanhamento&done=cycle");
  });

  it("does not navigate on failure and preserves the typed message/date", async () => {
    intelligentResult = { error: { message: "Não foi possível criar o ciclo." } };
    await goToConfirmStep();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar ciclo" }));

    await screen.findByText("Não foi possível criar o ciclo.");
    expect(nav.replace).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Data de início do ciclo")).toHaveValue("2026-09-01");
  });

  it("ignores a duplicate click while a request is already in flight, sending only one create call", async () => {
    await goToConfirmStep();
    const button = screen.getByRole("button", { name: "Confirmar ciclo" });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    expect(intelligentCalls).toHaveLength(1);
  });

  it("reuses the same idempotency key across a failed attempt and a retry", async () => {
    intelligentResult = { error: { message: "Conflito temporário." } };
    await goToConfirmStep();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar ciclo" }));
    await screen.findByText("Conflito temporário.");

    intelligentResult = {};
    fireEvent.click(screen.getByRole("button", { name: "Confirmar ciclo" }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());

    expect(intelligentCalls).toHaveLength(2);
    expect(intelligentCalls[0].idempotency_key).toBe(intelligentCalls[1].idempotency_key);
  });
});
