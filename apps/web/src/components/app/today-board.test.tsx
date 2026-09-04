import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { HomeSummary } from "@/lib/api";

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    me: {
      user: { full_name: "Profissional Teste" },
      organization: { timezone: "America/Sao_Paulo", profession_code: "personal_trainer" },
    },
  }),
}));

const board = vi.hoisted(() => ({ items: [] as unknown[] }));
const accompaniment = vi.hoisted(() => ({ items: [] as unknown[] }));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    apiFetch: vi.fn(async (path: string) => {
      if (path.includes("/routines/board")) return { data: { groups: [{ items: board.items }] } };
      if (path.includes("/accompaniment/pending")) return { data: { items: accompaniment.items } };
      if (path.includes("/receivables/overview")) {
        return {
          data: {
            summary: { received_month_cents: 0, overdue_cents: 0, overdue_count: 0, forecast_month_cents: 0, pending_count: 0 },
          },
        };
      }
      if (path.includes("/billing/entitlement")) return { data: null };
      return { data: null };
    }),
  };
});

import { TodayBoard } from "@/components/app/today-board";

const BASE_SUMMARY: HomeSummary = {
  organization_id: "org1",
  timezone: "America/Sao_Paulo",
  local_today: "2026-08-22",
  today_appointments: [],
  cycles_nearing_end: [],
  renewals: [],
  pending_payments: [],
  priority_action: null,
  contextual_hint: null,
  message: "Tudo em dia por aqui.",
  // Non-zero so the professional never reads as brand-new — routine
  // pendencies alone must not trigger the New-Professional journey.
  routines_due_today_count: 5,
};

describe("TodayBoard — only overdue routine occurrences ever enter the priority queue", () => {
  it("shows the overdue item labeled 'Rotina' and never shows the due-today (not overdue) one anywhere on the Home", async () => {
    board.items = [
      {
        id: "overdue-1",
        name: "Revisar plano",
        type_label: "Revisão",
        client_name: "Aluna Atrasada",
        client_id: "c-overdue",
        overdue: true,
        due_on: "2026-08-20",
        occurrence_type: "plan_review",
      },
      {
        id: "today-1",
        name: "Registrar feedback",
        type_label: "Feedback",
        client_name: "Aluno Hoje",
        client_id: "c-today",
        overdue: false,
        due_on: "2026-08-22",
        occurrence_type: "feedback",
      },
    ];
    render(<TodayBoard summary={BASE_SUMMARY} />);

    const queue = await screen.findByRole("region", { name: "Fila de prioridades" });
    expect(within(queue).getByText("Aluna Atrasada · venceu em 20/08/2026")).toBeInTheDocument();
    // "Rotina" appears as the origin label exactly for the overdue item —
    // never a second, unrelated "Rotinas de hoje" list.
    expect(within(queue).getByText("Rotina")).toBeInTheDocument();
    expect(screen.queryByText(/Aluno Hoje/)).not.toBeInTheDocument();
    expect(screen.queryByText("Registrar feedback")).not.toBeInTheDocument();
  });

  it("lists every overdue item individually — never grouped into a summary row", async () => {
    board.items = [
      { id: "a", type_label: "Rotina", client_name: "Cliente A", client_id: "c-a", overdue: true, due_on: "2026-08-15", occurrence_type: "occ-a" },
      { id: "b", type_label: "Rotina", client_name: "Cliente B", client_id: "c-b", overdue: true, due_on: "2026-08-16", occurrence_type: "occ-b" },
      { id: "c", type_label: "Rotina", client_name: "Cliente C", client_id: "c-c", overdue: true, due_on: "2026-08-17", occurrence_type: "occ-c" },
      { id: "d", type_label: "Rotina", client_name: "Cliente D", client_id: "c-d", overdue: true, due_on: "2026-08-18", occurrence_type: "occ-d" },
    ];
    render(<TodayBoard summary={BASE_SUMMARY} />);

    const queue = await screen.findByRole("region", { name: "Fila de prioridades" });
    expect(within(queue).getByText("Cliente A · venceu em 15/08/2026")).toBeInTheDocument();
    expect(within(queue).getByText("Cliente B · venceu em 16/08/2026")).toBeInTheDocument();
    expect(within(queue).getByText("Cliente C · venceu em 17/08/2026")).toBeInTheDocument();
    expect(within(queue).getByText("Cliente D · venceu em 18/08/2026")).toBeInTheDocument();
    expect(screen.queryByText("Atrasadas")).not.toBeInTheDocument();
  });
});

describe("TodayBoard — an overdue evaluation review routes straight to the evaluation form", () => {
  it("shows a single link straight to that client's evaluation form", async () => {
    board.items = [
      {
        id: "occ-eval-1",
        name: "Realizar avaliação",
        type_label: "Revisar avaliação",
        client_name: "Fernando",
        client_id: "client-fernando",
        overdue: true,
        due_on: "2026-08-21",
        occurrence_type: "evaluation_review",
      },
    ];
    render(<TodayBoard summary={BASE_SUMMARY} />);

    const queue = await screen.findByRole("region", { name: "Fila de prioridades" });
    const link = within(queue).getByRole("link", { name: /Realizar avaliação/i });
    expect(link).toHaveTextContent("Fernando");
    expect(link).toHaveAttribute(
      "href",
      "/app/clients/client-fernando/evaluations/new?returnTo=%2Fapp&occurrenceId=occ-eval-1",
    );

    // Whole row is exactly one <a> — no nested/duplicate link that could
    // double-fire navigation on a single tap.
    const container = link.closest("li");
    expect(container?.querySelectorAll("a")).toHaveLength(1);
  });

  it("never shows a due-today (not overdue) evaluation review — that belongs to the Rotinas screen, not the Home", async () => {
    board.items = [
      {
        id: "occ-eval-today",
        name: "Realizar avaliação",
        type_label: "Revisar avaliação",
        client_name: "Ana",
        client_id: "client-ana",
        overdue: false,
        due_on: "2026-08-22",
        occurrence_type: "evaluation_review",
      },
    ];
    render(<TodayBoard summary={BASE_SUMMARY} />);

    await screen.findByText("Financeiro");
    expect(screen.queryByText(/Realizar avaliação/)).not.toBeInTheDocument();
    expect(screen.queryByText("Ana")).not.toBeInTheDocument();
  });

  it("routes an overdue non-evaluation occurrence (plan_review) to the client profile instead of a form", async () => {
    board.items = [
      {
        id: "occ-plan",
        name: "Revisar plano",
        type_label: "Revisão",
        client_name: "Cliente Plano",
        client_id: "client-plano",
        overdue: true,
        due_on: "2026-08-20",
        occurrence_type: "plan_review",
      },
    ];
    render(<TodayBoard summary={BASE_SUMMARY} />);

    const queue = await screen.findByRole("region", { name: "Fila de prioridades" });
    const link = within(queue).getByRole("link", { name: /Revisar plano/i });
    expect(link).toHaveAttribute("href", "/app/clients/client-plano");
  });

  it("shows a success confirmation once, reading a sessionStorage flag set by the evaluation form", async () => {
    sessionStorage.setItem("croniu.evaluation-saved-celebrate", "1");
    board.items = [];
    render(<TodayBoard summary={BASE_SUMMARY} />);

    expect(await screen.findByText("Avaliação registrada com sucesso")).toBeInTheDocument();
    // Consumed — a fresh render (e.g. next visit) must not show it again.
    expect(sessionStorage.getItem("croniu.evaluation-saved-celebrate")).toBeNull();
  });
});

describe("TodayBoard — compact Financeiro (recebido/vencido/próximo, never the full dashboard)", () => {
  it("shows a dash for 'próximo a vencer' when there are no pending payments", async () => {
    board.items = [];
    render(<TodayBoard summary={{ ...BASE_SUMMARY, pending_payments: [] }} />);

    expect(await screen.findByText("Sem cobrança prevista")).toBeInTheDocument();
    expect(screen.getByText("Recebido no mês")).toBeInTheDocument();
    // Never the old full total-of-all-pendencies phrasing — that duplicated
    // the real Financeiro central instead of pointing to it.
    expect(screen.queryByText(/cobranças em aberto/)).not.toBeInTheDocument();
  });

  it("shows the next-due amount and date derived from real pending_payments, never a mocked number", async () => {
    board.items = [];
    render(
      <TodayBoard
        summary={{
          ...BASE_SUMMARY,
          pending_payments: [
            {
              id: "r1",
              cycle_id: "cy1",
              client_id: "c1",
              amount_cents: 15000,
              due_on: "2026-08-25",
              status: "pending",
              paid_at: null,
              payment_method: null,
              notes: null,
              created_at: "2026-08-01T00:00:00Z",
              updated_at: "2026-08-01T00:00:00Z",
              client_name: "Aluna A",
              cycle_service_name: null,
            },
            {
              id: "r2",
              cycle_id: "cy2",
              client_id: "c2",
              amount_cents: 9000,
              due_on: "2026-08-20",
              status: "pending",
              paid_at: null,
              payment_method: null,
              notes: null,
              created_at: "2026-08-01T00:00:00Z",
              updated_at: "2026-08-01T00:00:00Z",
              client_name: "Aluno B",
              cycle_service_name: null,
            },
          ],
        }}
      />,
    );

    // r2 due_on 08-20 is earlier than r1's 08-25 — the earliest one wins.
    expect(await screen.findByText(/R\$\s*90,00/)).toBeInTheDocument();
  });
});

describe("TodayBoard — quick actions always point to real, existing routes", () => {
  it("links to novo cliente, novo compromisso, nova rotina and a Cronia", async () => {
    board.items = [];
    render(<TodayBoard summary={BASE_SUMMARY} />);
    await screen.findByText("Financeiro");

    expect(screen.getByRole("link", { name: /Novo cliente/i })).toHaveAttribute(
      "href",
      "/app/clients/new",
    );
    expect(screen.getByRole("link", { name: /Novo compromisso/i })).toHaveAttribute(
      "href",
      "/app/appointments/new",
    );
    expect(screen.getByRole("link", { name: /Nova rotina/i })).toHaveAttribute(
      "href",
      "/app/routines",
    );
    expect(screen.getByRole("link", { name: /Perguntar à Cronia/i })).toHaveAttribute(
      "href",
      expect.stringContaining("/app/assistant?"),
    );
  });
});
