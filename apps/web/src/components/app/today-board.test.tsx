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
