import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ tab: "resumo" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(`tab=${nav.tab}`),
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    me: {
      organization: { profession_code: "personal_trainer" },
    },
  }),
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
      if (path.includes("/protocols")) {
        if (path.includes("c2")) return { data: [] };
        return {
          data: [
            {
              id: "p1",
              client_id: "c1",
              title: "Ganho de massa muscular",
              protocol_type: "training",
              status: "published",
              is_org_template: false,
              duration_value: 12,
              duration_unit: "weeks",
              current_version_number: 1,
              created_at: "",
              updated_at: "",
            },
          ],
        };
      }
      if (path.includes("/cycles")) {
        if (path.includes("c2")) return { data: [] };
        return {
          data: [
            {
              id: "cy1",
              client_id: "c1",
              service_id: "s1",
              cycle_type: "period",
              status: "active",
              starts_on: "2026-08-17",
              ends_on: "2026-09-17",
              lesson_count: 12,
              lessons_completed: 8,
              value_cents: 120000,
              notes: null,
              last_contacted_at: null,
              contact_confirmed_at: null,
              created_at: "",
              updated_at: "",
              client_name: "Pedro Silva",
              service_name: "Aula padrão",
              days_remaining: 9,
              is_nearing_end: false,
              weekdays: [1],
              default_starts_time: "08:00",
            },
          ],
        };
      }
      if (path.includes("/evaluations")) return { data: [] };
      if (path.includes("/public-access")) return { data: { has_active_link: false } };
      if (path.includes("/clients/c2")) {
        return {
          data: {
            id: "c2",
            full_name: "Ana Souza",
            status: "active",
            phone: "11900001111",
            email: "",
            notes: "",
          },
        };
      }
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

import { ClientProfile } from "@/components/app/client-profile";

describe("ClientProfile", () => {
  it("renders three tabs, readable status, and a single next action without technical enums", async () => {
    nav.tab = "resumo";
    render(<ClientProfile clientId="c1" />);
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Pedro Silva");
    expect(screen.getByRole("tab", { name: "Resumo" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Acompanhamento" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Dados" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Jornada" })).not.toBeInTheDocument();
    expect(screen.queryByText("continue_onboarding")).not.toBeInTheDocument();
    expect(screen.queryByText("draft")).not.toBeInTheDocument();
    expect(screen.queryByText(/Link secreto para o Meu Ciclo/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Gere um novo acesso/i)).not.toBeInTheDocument();
  });

  it("renders the portal card on the dados tab without asking to generate a copyable link", async () => {
    nav.tab = "dados";
    render(<ClientProfile clientId="c1" />);
    const portal = await screen.findByRole("region", { name: "Portal do cliente" });
    expect(portal).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Portal do cliente" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Criar acesso" }).length).toBeGreaterThan(0);
    expect(screen.queryByText(/o token completo não será mostrado/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Copiar link/i })).not.toBeInTheDocument();
  });

  it("humanizes cycle dates and keeps a single plan action", async () => {
    nav.tab = "acompanhamento";
    render(<ClientProfile clientId="c1" />);
    expect(await screen.findByText("Ciclo atual")).toBeInTheDocument();
    expect(screen.getByText(/17 ago\. a 16 set\./)).toBeInTheDocument();
    expect(screen.getByText(/Renovação em 17 set\./)).toBeInTheDocument();
    expect(screen.queryByText(/2026-08-17/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ver ciclo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ver plano" })).toBeInTheDocument();
    expect(screen.getByText("Nenhuma avaliação registrada")).toBeInTheDocument();
    expect(screen.getByText(/Registre o ponto de partida/i)).toBeInTheDocument();
  });

  it("never leaves the accompaniment tab blank for a new client", async () => {
    nav.tab = "acompanhamento";
    render(<ClientProfile clientId="c2" />);
    expect(await screen.findByRole("tabpanel", { name: "Acompanhamento" })).toBeInTheDocument();
    expect(screen.getByText("Ciclo atual")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar ciclo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar plano" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nova avaliação" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ver rotinas" })).toBeInTheDocument();
    expect(screen.queryByText("Criar treino")).not.toBeInTheDocument();
  });

  it("shows next header action inside the accompaniment tab", async () => {
    nav.tab = "acompanhamento";
    render(<ClientProfile clientId="c1" />);
    expect(await screen.findByText("Próxima ação")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ver ciclo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ver plano" })).toBeInTheDocument();
  });

  it("clears previous client name when switching fichas", async () => {
    nav.tab = "resumo";
    const { rerender } = render(<ClientProfile clientId="c1" />);
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Pedro Silva");
    rerender(<ClientProfile clientId="c2" />);
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Ana Souza");
    expect(screen.queryByText("Pedro Silva")).not.toBeInTheDocument();
  });
});
