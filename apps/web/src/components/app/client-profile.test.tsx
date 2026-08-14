import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ClientProfile } from "@/components/app/client-profile";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams("tab=resumo"),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    apiFetch: vi.fn(async (path: string) => {
      if (path.includes("/profession")) {
        return { data: { profession_code: "personal_trainer", nomenclature: {} } };
      }
      if (path.includes("/preferences")) {
        return { data: { local_today: "2026-08-13" } };
      }
      if (path.includes("/journey")) {
        return {
          data: {
            id: "j1",
            client_id: "c1",
            stage: "active",
            stage_label: "Em acompanhamento",
            next_action: "continue_onboarding",
            next_action_label: "Preparar acompanhamento",
            created_at: "",
            updated_at: "",
          },
        };
      }
      if (path.includes("/protocols")) return { data: [] };
      if (path.includes("/cycles")) return { data: [] };
      if (path.includes("/public-access")) return { data: { has_active_link: false } };
      if (path.includes("/clients/c1")) {
        return {
          data: {
            id: "c1",
            full_name: "Pedro Silva",
            status: "active",
            phone: "11987654321",
            email: "hidden@example.com",
            notes: "",
          },
        };
      }
      return { data: null };
    }),
  };
});

describe("ClientProfile", () => {
  it("renders three tabs, readable status, and a single next action without technical enums", async () => {
    render(<ClientProfile clientId="c1" />);
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Pedro Silva");
    expect(screen.getByRole("tab", { name: "Resumo" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Acompanhamento" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Dados" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Jornada" })).not.toBeInTheDocument();
    expect(screen.getByText("Criar ciclo")).toBeInTheDocument();
    expect(screen.queryAllByText("Criar ciclo")).toHaveLength(1);
    expect(screen.queryByText("continue_onboarding")).not.toBeInTheDocument();
    expect(screen.queryByText("draft")).not.toBeInTheDocument();
    expect(screen.queryByText(/Link secreto para o Meu Ciclo/i)).not.toBeInTheDocument();
  });
});
