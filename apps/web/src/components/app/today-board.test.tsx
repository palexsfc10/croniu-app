import { render, screen } from "@testing-library/react";
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

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    apiFetch: vi.fn(async (path: string) => {
      if (path.includes("/routines/board")) return { data: { groups: [{ items: board.items }] } };
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
  // Non-zero so `fullyClear` is false and the "Suas ações de hoje" section
  // (backed by the /routines/board fetch under test) actually renders
  // instead of the unrelated "Tudo organizado" success empty-state.
  routines_due_today_count: 5,
};

describe("TodayBoard — overdue vs. today never share the same visual treatment", () => {
  it("renders an overdue action with a danger badge and a today action with a neutral badge", async () => {
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

    const overdueBadge = await screen.findByText("Atrasada");
    expect(overdueBadge).toHaveClass("badge-danger");
    expect(overdueBadge).not.toHaveClass("badge-neutral");

    const todayBadge = screen.getByText("Hoje");
    expect(todayBadge).toHaveClass("badge-neutral");
    expect(todayBadge).not.toHaveClass("badge-danger");
  });

  it("marks a grouped rest-summary row as overdue with a danger badge, not plain text", async () => {
    // TODAY_ACTIONS_LIMIT is 3 and overdue items always sort before non-
    // overdue ones, so a 4th overdue item (own occurrence_type) is pushed
    // into the "rest" summary group — which must still read as overdue.
    board.items = [
      {
        id: "a",
        type_label: "Rotina",
        client_name: "Cliente A",
        client_id: "c-a",
        overdue: true,
        due_on: "2026-08-15",
        occurrence_type: "occ-a",
      },
      {
        id: "b",
        type_label: "Rotina",
        client_name: "Cliente B",
        client_id: "c-b",
        overdue: true,
        due_on: "2026-08-16",
        occurrence_type: "occ-b",
      },
      {
        id: "c",
        type_label: "Rotina",
        client_name: "Cliente C",
        client_id: "c-c",
        overdue: true,
        due_on: "2026-08-17",
        occurrence_type: "occ-c",
      },
      {
        id: "d",
        type_label: "Rotina",
        client_name: "Cliente D",
        client_id: "c-d",
        overdue: true,
        due_on: "2026-08-18",
        occurrence_type: "occ-d",
      },
    ];
    render(<TodayBoard summary={BASE_SUMMARY} />);

    const restBadge = await screen.findByText("Atrasadas");
    expect(restBadge).toHaveClass("badge-danger");
  });
});

describe("TodayBoard — evaluation card opens the form directly", () => {
  it("shows the correct student and a single link straight to that client's evaluation form", async () => {
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

    const link = await screen.findByRole("link", { name: /Realizar avaliação/i });
    expect(link).toHaveTextContent("Fernando");
    expect(link).toHaveAttribute(
      "href",
      "/app/clients/client-fernando/evaluations/new?returnTo=%2Fapp&occurrenceId=occ-eval-1",
    );

    // Whole card is exactly one <a> — no nested/duplicate link that could
    // double-fire navigation on a single tap.
    const container = link.closest("li");
    expect(container?.querySelectorAll("a")).toHaveLength(1);

    // Never routed through the client profile or "Preparar acompanhamento".
    expect(screen.queryByText("Abrir cliente")).not.toBeInTheDocument();
  });

  it("uses a danger badge for an overdue evaluation and never green", async () => {
    board.items = [
      {
        id: "occ-eval-overdue",
        name: "Realizar avaliação",
        type_label: "Revisar avaliação",
        client_name: "Marcos",
        client_id: "client-marcos",
        overdue: true,
        due_on: "2026-08-20",
        occurrence_type: "evaluation_review",
      },
    ];
    render(<TodayBoard summary={BASE_SUMMARY} />);

    const badge = await screen.findByText("Atrasada");
    expect(badge).toHaveClass("badge-danger");
    expect(badge).not.toHaveClass("badge-success");
    expect(screen.getByText(/venceu em/i)).toBeInTheDocument();
  });

  it("uses a warning badge (not danger) for an evaluation due today", async () => {
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

    const badge = await screen.findByText("Hoje");
    expect(badge).toHaveClass("badge-warning");
    expect(badge).not.toHaveClass("badge-danger");
    expect(screen.getByText(/vence hoje/i)).toBeInTheDocument();
  });

  it("leaves other occurrence types on their existing destination (Abrir cliente)", async () => {
    board.items = [
      {
        id: "occ-plan",
        name: "Revisar plano",
        type_label: "Revisão",
        client_name: "Cliente Plano",
        client_id: "client-plano",
        overdue: false,
        due_on: "2026-08-22",
        occurrence_type: "plan_review",
      },
    ];
    render(<TodayBoard summary={BASE_SUMMARY} />);

    const link = await screen.findByRole("link", { name: "Abrir cliente" });
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
