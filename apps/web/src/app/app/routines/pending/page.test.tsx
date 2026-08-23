import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    apiFetch: vi.fn(async () => ({
      data: {
        groups: [
          {
            occurrence_type: "plan_review",
            label: "Revisão de plano",
            count: 2,
            occurrence_count: 2,
            client_count: 2,
            overdue_count: 1,
            items: [
              {
                id: "occ-1",
                client_id: "c1",
                client_name: "Aluno A",
                plan_title: null,
                due_on: "2026-08-20",
                overdue: true,
                type_label: "Revisão",
              },
              {
                id: "occ-2",
                client_id: "c2",
                client_name: "Aluno B",
                plan_title: null,
                due_on: "2026-08-25",
                overdue: false,
                type_label: "Revisão",
              },
            ],
          },
        ],
      },
    })),
  };
});

import RoutinesPendingPage from "@/app/app/routines/pending/page";

describe("Routines pending board — overdue count is colored, not plain text", () => {
  it("shows the overdue count as a danger badge", async () => {
    render(<RoutinesPendingPage />);
    const badge = await screen.findByText("1 atrasado");
    expect(badge).toHaveClass("badge-danger");
  });
});
