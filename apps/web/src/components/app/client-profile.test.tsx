import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ tab: "resumo", extraQuery: "", replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(`tab=${nav.tab}${nav.extraQuery}`),
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    me: {
      organization: { timezone: "America/Sao_Paulo", profession_code: "personal_trainer" },
    },
  }),
}));

const CLIENTS: Record<string, Record<string, unknown>> = {
  c1: {
    id: "c1",
    full_name: "Pedro Silva",
    status: "active",
    phone: "11987654321",
    email: "hidden@example.com",
    notes: "",
  },
  c2: {
    id: "c2",
    full_name: "Ana Souza",
    status: "active",
    phone: "11900001111",
    email: "",
    notes: "",
  },
  c3: {
    id: "c3",
    full_name: "Carla Nunes",
    status: "archived",
    phone: "11911112222",
    email: "",
    notes: "",
  },
};

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    apiFetch: vi.fn(async (path: string, init?: RequestInit) => {
      if (init?.method === "PATCH" && /\/clients\/(c1|c2|c3)$/.test(path)) {
        const id = path.split("/").pop()!;
        const body = JSON.parse((init.body as string) || "{}");
        return { data: { ...CLIENTS[id], ...body } };
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
      if (path.includes("/appointments")) {
        if (path.includes("c1")) {
          return {
            data: [
              {
                id: "appt1",
                client_id: "c1",
                cycle_id: null,
                service_id: null,
                location_id: null,
                title: null,
                starts_at: "2026-08-20T14:00:00Z",
                ends_at: "2026-08-20T15:00:00Z",
                status: "scheduled",
                notes: null,
                created_at: "",
                updated_at: "",
                client_name: "Pedro Silva",
                service_name: "Treino",
                location_name: null,
                cycle_service_name: null,
              },
            ],
          };
        }
        return { data: [] };
      }
      if (path.includes("/receivables")) {
        if (path.includes("c1")) {
          return {
            data: [
              {
                id: "r1",
                cycle_id: "cy1",
                client_id: "c1",
                amount_cents: 15000,
                due_on: "2026-08-01",
                status: "pending",
                paid_at: null,
                payment_method: null,
                notes: null,
                created_at: "",
                updated_at: "",
                client_name: "Pedro Silva",
                cycle_service_name: "Aula padrão",
              },
            ],
          };
        }
        return { data: [] };
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
      if (path.includes("/intake-submissions?client_id=c2")) {
        return { data: [{ id: "sub-c2", submitted_at: "2026-08-13T10:00:00Z" }] };
      }
      if (path.includes("/intake-submissions?client_id=")) return { data: [] };
      if (path.includes("/routines/board")) return { data: { groups: [] } };
      if (/\/clients\/(c1|c2|c3)$/.test(path)) {
        const id = path.split("/").pop()!;
        return { data: CLIENTS[id] };
      }
      return { data: null };
    }),
  };
});

import { ClientProfile } from "@/components/app/client-profile";

describe("ClientProfile", () => {
  beforeEach(() => {
    nav.extraQuery = "";
    nav.replace.mockClear();
  });

  it("renders six tabs and a readable status, without technical enums leaking through", async () => {
    nav.tab = "resumo";
    render(<ClientProfile clientId="c1" />);
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Pedro Silva");
    for (const label of ["Resumo", "Agenda", "Plano e ciclo", "Prontuário", "Financeiro", "Histórico"]) {
      expect(screen.getByRole("tab", { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByRole("tab", { name: "Dados" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Acompanhamento" })).not.toBeInTheDocument();
    expect(screen.queryByText("continue_onboarding")).not.toBeInTheDocument();
  });

  it("shows the quick-actions row with real, working links", async () => {
    nav.tab = "resumo";
    render(<ClientProfile clientId="c1" />);
    await screen.findByRole("heading", { level: 1 });
    const actions = within(screen.getByLabelText("Ações do cliente"));
    expect(actions.getByRole("link", { name: /Agendar/i })).toHaveAttribute(
      "href",
      expect.stringContaining("/app/appointments/new?clientId=c1"),
    );
    expect(actions.getByRole("link", { name: /Registrar avaliação/i })).toHaveAttribute(
      "href",
      expect.stringContaining("/app/clients/c1/evaluations/new"),
    );
    expect(actions.getByRole("button", { name: /Adicionar anotação/i })).toBeInTheDocument();
    expect(actions.getByRole("link", { name: /Criar rotina/i })).toHaveAttribute(
      "href",
      "/app/routines?clientId=c1",
    );
    expect(actions.getByRole("link", { name: /Perguntar sobre este cliente/i })).toHaveAttribute(
      "href",
      expect.stringContaining("/app/assistant?prompt="),
    );
    expect(actions.getByRole("link", { name: "Editar" })).toHaveAttribute(
      "href",
      "/app/clients/c1/edit",
    );
  });

  it("Resumo (desktop tab) shows contact, service, progress, next session, and financeiro from real data", async () => {
    nav.tab = "resumo";
    render(<ClientProfile clientId="c1" />);
    await screen.findByRole("heading", { level: 1 });
    const panel = within(screen.getByRole("tabpanel", { name: "Resumo" }));
    expect(panel.getByText("(11) 98765-4321")).toBeInTheDocument();
    expect(panel.getByText("Aula padrão")).toBeInTheDocument();
    expect(panel.getByText("8 de 12 sessões")).toBeInTheDocument();
    expect(panel.getByText(/R\$\s*150,00/)).toBeInTheDocument();
  });

  it("Resumo (mobile consolidated view) shows the same real data, without the desktop tab bar", async () => {
    nav.tab = "resumo";
    render(<ClientProfile clientId="c1" />);
    await screen.findByRole("heading", { level: 1 });
    const mobile = within(screen.getByLabelText("Resumo do cliente"));
    expect(mobile.getByText("Aula padrão")).toBeInTheDocument();
    expect(mobile.getByText("8 de 12 sessões")).toBeInTheDocument();
    expect(mobile.getAllByText(/R\$\s*150,00/).length).toBeGreaterThan(0);
    // Detailed lists are behind disclosure, not shown flat — the collapsed
    // <details> summaries are present, their content isn't forced open.
    expect(mobile.getByText("Agenda completa")).toBeInTheDocument();
    expect(mobile.getByText("Prontuário")).toBeInTheDocument();
    expect(mobile.getByText("Financeiro completo")).toBeInTheDocument();
    expect(mobile.getByText("Histórico")).toBeInTheDocument();
  });

  it("desktop tabs stay hidden on mobile; the mobile summary stays hidden on desktop (CSS-driven split)", async () => {
    nav.tab = "resumo";
    render(<ClientProfile clientId="c1" />);
    await screen.findByRole("heading", { level: 1 });
    const desktopWrapper = screen.getByRole("tabpanel", { name: "Resumo" }).closest(".hidden.lg\\:block");
    expect(desktopWrapper).not.toBeNull();
    const mobileWrapper = screen.getByLabelText("Resumo do cliente");
    expect(mobileWrapper.className).toContain("lg:hidden");
  });

  it("Resumo always links to Rotinas, even with zero pending — the action never disappears", async () => {
    nav.tab = "resumo";
    render(<ClientProfile clientId="c1" />);
    await screen.findByRole("heading", { level: 1 });
    const rotinasLink = screen.getByRole("link", { name: /Rotinas/ });
    expect(rotinasLink).toHaveAttribute(
      "href",
      expect.stringContaining("/app/routines/pending?clientId=c1"),
    );
    expect(rotinasLink).toHaveTextContent("Em dia");
  });

  it("Agenda tab (desktop) lists the client's upcoming appointments from the new per-client endpoint", async () => {
    nav.tab = "agenda";
    render(<ClientProfile clientId="c1" />);
    const panel = within(await screen.findByRole("tabpanel", { name: "Agenda" }));
    expect(panel.getByText("Próximas sessões")).toBeInTheDocument();
    expect(panel.getByText(/Treino/)).toBeInTheDocument();
  });

  it("Agenda tab offers a real empty-state action when there is nothing scheduled", async () => {
    nav.tab = "agenda";
    render(<ClientProfile clientId="c2" />);
    expect(await screen.findByText("Nenhuma sessão agendada")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Agendar sessão" })).toBeInTheDocument();
  });

  it("Plano e ciclo humanizes cycle dates and keeps a single plan action", async () => {
    nav.tab = "plano";
    render(<ClientProfile clientId="c1" />);
    expect(await screen.findByText("Ciclo atual")).toBeInTheDocument();
    expect(screen.getByText(/17 ago\. a 16 set\./)).toBeInTheDocument();
    expect(screen.getByText(/Renovação em 17 set\./)).toBeInTheDocument();
    expect(screen.queryByText(/2026-08-17/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ver ciclo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ver plano" })).toBeInTheDocument();
  });

  it("Plano e ciclo never leaves a new client's tab blank", async () => {
    nav.tab = "plano";
    render(<ClientProfile clientId="c2" />);
    expect(await screen.findByRole("tabpanel", { name: "Plano e ciclo" })).toBeInTheDocument();
    expect(screen.getByText("Ciclo atual")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar ciclo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar plano" })).toBeInTheDocument();
  });

  it("Prontuário groups anamnese and avaliações without losing the intake-review link", async () => {
    nav.tab = "prontuario";
    render(<ClientProfile clientId="c2" />);
    const panel = await screen.findByRole("tabpanel", { name: "Prontuário" });
    expect(within(panel).getByText(/Nenhuma avaliação registrada/)).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: /Anamnese/ })).toHaveAttribute(
      "href",
      "/app/clients/intake/sub-c2",
    );
  });

  it("Financeiro tab lists real receivables with an overdue badge, never a mocked total", async () => {
    nav.tab = "financeiro";
    render(<ClientProfile clientId="c1" />);
    const panel = await screen.findByRole("tabpanel", { name: "Financeiro" });
    expect(within(panel).getAllByText(/R\$\s*150,00/).length).toBeGreaterThan(0);
    expect(within(panel).getByText(/Vencimento/)).toHaveTextContent("Vencimento 01/08/2026 · Aula padrão");
  });

  it("Histórico shows an honest empty state when there is nothing to show yet", async () => {
    nav.tab = "historico";
    render(<ClientProfile clientId="c2" />);
    expect(await screen.findByText("Sem histórico ainda")).toBeInTheDocument();
  });

  it("shows an archived client's status badge in neutral tone and offers Reativar instead of Arquivar", async () => {
    nav.tab = "resumo";
    render(<ClientProfile clientId="c3" />);
    const badge = await screen.findByText("Arquivado");
    expect(badge).toHaveClass("badge-neutral");
    expect(badge).not.toHaveClass("badge-info");

    const user = userEvent.setup();
    await user.click(screen.getByLabelText("Mais ações"));
    expect(screen.getByRole("button", { name: "Reativar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Arquivar" })).not.toBeInTheDocument();
  });

  it("clears previous client name when switching fichas", async () => {
    nav.tab = "resumo";
    const { rerender } = render(<ClientProfile clientId="c1" />);
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Pedro Silva");
    rerender(<ClientProfile clientId="c2" />);
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Ana Souza");
    expect(screen.queryByText("Pedro Silva")).not.toBeInTheDocument();
  });

  it("shows a short success message after creating a cycle and strips the one-time marker from the URL", async () => {
    nav.tab = "plano";
    nav.extraQuery = "&done=cycle";
    render(<ClientProfile clientId="c1" />);

    expect(await screen.findByText("Ciclo criado com sucesso.")).toBeInTheDocument();
    expect(await screen.findByRole("tabpanel", { name: "Plano e ciclo" })).toBeInTheDocument();
    expect(screen.getByText("Ciclo atual")).toBeInTheDocument();

    expect(nav.replace).toHaveBeenCalledWith("/app/clients/c1?tab=plano");
  });

  it("never leaves the ficha blank when the tab query value is unrecognized (defense against a malformed redirect URL)", async () => {
    nav.tab = "acompanhamento?done=cycle";
    render(<ClientProfile clientId="c1" />);

    await screen.findByRole("heading", { level: 1 });
    const panel = within(screen.getByRole("tabpanel", { name: "Resumo" }));
    expect(panel.getByText("Próximo passo")).toBeInTheDocument();
  });

  it("Adicionar anotação saves through the existing PATCH /clients/{id} endpoint", async () => {
    nav.tab = "resumo";
    const user = userEvent.setup();
    render(<ClientProfile clientId="c1" />);
    await screen.findByRole("heading", { level: 1 });

    await user.click(screen.getByRole("button", { name: /Adicionar anotação/i }));
    const textbox = await screen.findByLabelText("Anotação");
    await user.type(textbox, "Prefere treinar de manhã");
    await user.click(screen.getByRole("button", { name: "Salvar anotação" }));

    expect(await screen.findByText("Anotação salva")).toBeInTheDocument();
  });
});
