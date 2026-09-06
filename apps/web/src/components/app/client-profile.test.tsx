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
  c4: {
    id: "c4",
    full_name: "Bruno Costa",
    status: "active",
    phone: "11922223333",
    email: "",
    notes: "",
  },
  c5: {
    id: "c5",
    full_name: "Diana Alves",
    status: "active",
    phone: "11933334444",
    email: "",
    notes: "",
  },
  c7: {
    id: "c7",
    full_name: "Elias Rocha",
    status: "active",
    phone: "11944445555",
    email: "",
    notes: "",
  },
  c8: {
    id: "c8",
    full_name: "Fabio Prado",
    status: "active",
    phone: "11955556666",
    email: "",
    notes: "",
  },
  c9: {
    id: "c9",
    full_name: "Gabriela Reis",
    status: "active",
    phone: "11966667777",
    email: "",
    notes: "",
  },
};

// Same shape the backend's resolve_accompaniment/_journey_out actually
// returns — next_action/next_action_label are the canonical, already
// cycle-aware decision; the checklist is the raw per-step status (may
// still say "todo" for a step that isn't presented as next).
const JOURNEYS: Record<string, Record<string, unknown>> = {
  c1: {
    id: "j1",
    client_id: "c1",
    stage: "active",
    stage_label: "Em acompanhamento",
    next_action: "continue_onboarding",
    next_action_label: "Preparar acompanhamento",
    created_at: "",
    updated_at: "",
  },
  // Sem ciclo, anamnese ainda pendente.
  c4: {
    id: "j4",
    client_id: "c4",
    stage: "approved",
    stage_label: "Cadastro aprovado",
    next_action: "review_anamnesis",
    next_action_label: "Analisar formulário",
    accompaniment_checklist: {
      anamnesis: "todo",
      evaluation: "todo",
      plan: "todo",
      cycle: "todo",
      agenda: "todo",
      routine: "todo",
      activate: "todo",
    },
    created_at: "",
    updated_at: "",
  },
  // Sem ciclo, anamnese concluída — avaliação seguiria seria a próxima pela
  // ordem crua do checklist, mas o backend pula (sem ciclo ainda), então o
  // próximo passo real é o plano.
  c5: {
    id: "j5",
    client_id: "c5",
    stage: "approved",
    stage_label: "Cadastro aprovado",
    next_action: "create_plan",
    next_action_label: "Criar plano",
    accompaniment_checklist: {
      anamnesis: "done",
      evaluation: "todo",
      plan: "todo",
      cycle: "todo",
      agenda: "todo",
      routine: "todo",
      activate: "todo",
    },
    created_at: "",
    updated_at: "",
  },
  // Ciclo real existe — avaliação volta a ser elegível e é o próximo passo.
  c7: {
    id: "j7",
    client_id: "c7",
    stage: "evaluation_pending",
    stage_label: "Avaliação pendente",
    next_action: "register_evaluation",
    next_action_label: "Registrar avaliação",
    accompaniment_checklist: {
      anamnesis: "done",
      evaluation: "todo",
      plan: "done",
      cycle: "done",
      agenda: "done",
      routine: "na",
      activate: "todo",
    },
    created_at: "",
    updated_at: "",
  },
  // Ciclo, avaliação e plano prontos — checklist aponta "Configurar
  // rotina" como próximo passo, mas o cliente já tem rotinas na agenda
  // (routines/board mock for c8 below returns occurrence_count: 6).
  c8: {
    id: "j8",
    client_id: "c8",
    stage: "active",
    stage_label: "Em acompanhamento",
    next_action: "configure_routine",
    next_action_label: "Configurar rotina",
    accompaniment_checklist: {
      anamnesis: "done",
      evaluation: "done",
      plan: "done",
      cycle: "done",
      agenda: "done",
      routine: "todo",
      activate: "done",
    },
    created_at: "",
    updated_at: "",
  },
};

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    apiFetch: vi.fn(async (path: string, init?: RequestInit) => {
      const clientIdPattern = new RegExp(`/clients/(${Object.keys(CLIENTS).join("|")})$`);
      if (init?.method === "PATCH" && clientIdPattern.test(path)) {
        const id = path.split("/").pop()!;
        const body = JSON.parse((init.body as string) || "{}");
        return { data: { ...CLIENTS[id], ...body } };
      }
      if (path.includes("/preferences")) {
        return { data: { local_today: "2026-08-13" } };
      }
      if (path.includes("/journey")) {
        const clientId = Object.keys(JOURNEYS).find((id) => path.includes(id)) ?? "c1";
        return { data: JOURNEYS[clientId] };
      }
      if (path.includes("/protocols")) {
        if (!path.includes("c1")) return { data: [] };
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
        if (!path.includes("c1")) return { data: [] };
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
      if (path.includes("/routines/board")) {
        if (path.includes("client_id=c8")) {
          return {
            data: {
              groups: [{ occurrence_type: "custom_task", count: 6, occurrence_count: 6, overdue_count: 2 }],
            },
          };
        }
        if (path.includes("client_id=c9")) {
          return {
            data: {
              groups: [{ occurrence_type: "custom_task", count: 3, occurrence_count: 3, overdue_count: 0 }],
            },
          };
        }
        return { data: { groups: [] } };
      }
      if (clientIdPattern.test(path)) {
        const id = path.split("/").pop()!;
        return { data: CLIENTS[id] };
      }
      return { data: null };
    }),
  };
});

import { ClientProfile, __resetClientProfileCacheForTests } from "@/components/app/client-profile";

describe("ClientProfile", () => {
  beforeEach(() => {
    nav.extraQuery = "";
    nav.replace.mockClear();
    __resetClientProfileCacheForTests();
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

  it("shows one contextual primary action (Agendar) plus Cronia — never a row of equal-weight buttons", async () => {
    nav.tab = "resumo";
    render(<ClientProfile clientId="c1" />);
    await screen.findByRole("heading", { level: 1 });
    const actions = within(screen.getByLabelText("Ações do cliente"));
    expect(actions.getByRole("link", { name: /Agendar/i })).toHaveAttribute(
      "href",
      expect.stringContaining("/app/appointments/new?clientId=c1"),
    );
    expect(actions.getByRole("link", { name: /Perguntar sobre este cliente/i })).toHaveAttribute(
      "href",
      expect.stringContaining("/app/assistant?prompt="),
    );
    // Everything else that used to sit in this row at the same visual
    // weight now lives one tap away, inside "Mais ações".
    expect(actions.queryByRole("link", { name: /Registrar avaliação/i })).not.toBeInTheDocument();
    expect(actions.queryByRole("button", { name: /Adicionar anotação/i })).not.toBeInTheDocument();
    expect(actions.queryByRole("link", { name: /Criar rotina/i })).not.toBeInTheDocument();
    expect(actions.queryByRole("link", { name: "Editar" })).not.toBeInTheDocument();
  });

  it("moves Registrar avaliação, Criar rotina, Adicionar anotação and Editar into 'Mais ações'", async () => {
    nav.tab = "resumo";
    render(<ClientProfile clientId="c1" />);
    await screen.findByRole("heading", { level: 1 });
    const user = userEvent.setup();
    await user.click(screen.getByLabelText("Mais ações"));
    expect(screen.getByRole("link", { name: /Registrar avaliação/i })).toHaveAttribute(
      "href",
      expect.stringContaining("/app/clients/c1/evaluations/new"),
    );
    expect(screen.getByRole("link", { name: /Criar rotina/i })).toHaveAttribute(
      "href",
      "/app/routines?clientId=c1",
    );
    expect(screen.getByRole("button", { name: /Adicionar anotação/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Editar" })).toHaveAttribute(
      "href",
      "/app/clients/c1/edit",
    );
  });

  it("on a desktop viewport, 'Editar' opens the inline drawer over the Cliente 360° instead of navigating away", async () => {
    const matchMediaMock = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal("matchMedia", matchMediaMock);
    nav.tab = "resumo";
    const user = userEvent.setup();
    render(<ClientProfile clientId="c1" />);
    await screen.findByRole("heading", { level: 1 });
    await user.click(screen.getByLabelText("Mais ações"));
    expect(screen.queryByRole("link", { name: "Editar" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Editar" }));
    expect(screen.getByRole("dialog", { name: "Editar cliente" })).toBeInTheDocument();
    // The 360° header is still there, mounted behind the drawer.
    expect(screen.getByRole("heading", { level: 1, name: "Pedro Silva" })).toBeInTheDocument();
    vi.unstubAllGlobals();
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

  it("Resumo's Anamnese card offers a direct 'Ver anamnese' action when a submission exists", async () => {
    nav.tab = "resumo";
    render(<ClientProfile clientId="c2" />);
    const panel = within(await screen.findByRole("tabpanel", { name: "Resumo" }));
    expect(panel.getByRole("link", { name: "Ver anamnese" })).toHaveAttribute(
      "href",
      "/app/clients/intake/sub-c2?returnTo=%2Fapp%2Fclients%2Fc2",
    );
  });

  it("Prontuário groups anamnese and avaliações without losing the intake-review link", async () => {
    nav.tab = "prontuario";
    render(<ClientProfile clientId="c2" />);
    const panel = await screen.findByRole("tabpanel", { name: "Prontuário" });
    expect(within(panel).getByText(/Nenhuma avaliação registrada/)).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: /Anamnese/ })).toHaveAttribute(
      "href",
      "/app/clients/intake/sub-c2?returnTo=%2Fapp%2Fclients%2Fc2%3Ftab%3Dprontuario",
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

describe("ClientProfile — no full-skeleton flicker on a same-client remount", () => {
  beforeEach(() => {
    nav.tab = "resumo";
    __resetClientProfileCacheForTests();
  });

  it("shows the real skeleton (no heading yet) on a genuinely first visit to a client", () => {
    render(<ClientProfile clientId="c1" />);
    // Synchronous assertion, no await: this is what the DOM looks like on
    // the very first paint, before the mocked fetch's promise resolves.
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });

  it("hydrates instantly from the last good snapshot on a remount for the SAME client — the Cliente 360° → Rotinas → voltar case", async () => {
    const first = render(<ClientProfile clientId="c1" />);
    await screen.findByRole("heading", { level: 1 });
    first.unmount();

    // A real remount (route page uses key={clientId}), simulating the
    // back-navigation from Rotinas landing on the same student a moment
    // later — must not blank the page back to a skeleton.
    render(<ClientProfile clientId="c1" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Pedro Silva");

    // The silent background refetch still runs and completes cleanly.
    await screen.findByRole("heading", { level: 1 });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Pedro Silva");
  });

  it("never shows a previous client's data when switching to a different, not-yet-cached client", async () => {
    const first = render(<ClientProfile clientId="c1" />);
    await screen.findByRole("heading", { level: 1 });
    first.unmount();

    // c2 has never been visited in this session — must render its own
    // skeleton, never Pedro Silva's (c1) cached content.
    render(<ClientProfile clientId="c2" />);
    expect(screen.queryByText("Pedro Silva")).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Ana Souza");
  });
});

describe("ClientProfile — routines alert strip only fires on real overdue occurrences", () => {
  beforeEach(() => {
    nav.tab = "resumo";
    __resetClientProfileCacheForTests();
  });

  it("shows the yellow alert with the backend's own overdue_count, not the total pending count", async () => {
    render(<ClientProfile clientId="c8" />);
    await screen.findByRole("heading", { level: 1 });
    expect((await screen.findAllByText("2 rotinas atrasadas.")).length).toBeGreaterThan(0);
    // The permanent summary card keeps showing the total, untouched.
    expect(screen.getAllByText("6 pendentes").length).toBeGreaterThan(0);
  });

  it("distinguishes 'Configurar rotina' (checklist) from already having routine tasks on the board — no silent auto-completion", async () => {
    render(<ClientProfile clientId="c8" />);
    await screen.findByRole("heading", { level: 1 });
    // The checklist's CTA still names the pending checklist step exactly —
    // this is deliberately NOT auto-completed just because tasks exist.
    expect(screen.getAllByText("Configurar rotina").length).toBeGreaterThan(0);
    // But the panel text now explains the two concepts are different,
    // instead of silently contradicting the "6 rotinas" already visible.
    expect(
      screen.getAllByText(/já tem 6 rotinas na agenda.*configuração recorrente/).length,
    ).toBeGreaterThan(0);
  });

  it("does not show the alert when routines are pending but none are overdue (today/future)", async () => {
    render(<ClientProfile clientId="c9" />);
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByText(/rotinas? (pendente|atrasada)/i)).not.toBeInTheDocument();
    // The summary card still reports the 3 pending routines — only the
    // redundant yellow duplicate is gone.
    expect(screen.getAllByText("3 pendentes").length).toBeGreaterThan(0);
  });
});

describe("ClientProfile — Próximo passo mirrors only the backend's canonical next step", () => {
  beforeEach(() => {
    nav.tab = "resumo";
  });

  it("client without a cycle, anamnese pendente: CTA names the backend's real next step (Analisar formulário), never a re-derived checklist", async () => {
    render(<ClientProfile clientId="c4" />);
    await screen.findByRole("heading", { level: 1 });
    // The compact header indicator always names the one canonical step.
    expect(screen.getByText("Próximo: Analisar formulário")).toBeInTheDocument();
    const panel = within(await screen.findByRole("tabpanel", { name: "Resumo" }));
    expect(panel.getByRole("link", { name: "Analisar formulário" })).toHaveAttribute(
      "href",
      "/app/clients/c4/accompaniment",
    );
    // No re-derived "Falta: ..." enumeration, and avaliação is never
    // offered as a clickable next-step action here — only as the ordinary,
    // always-present "Avaliação" summary fact (checked separately below).
    expect(panel.queryByText(/Falta:/)).not.toBeInTheDocument();
    expect(panel.queryByRole("link", { name: /avalia[cç][aã]o/i })).not.toBeInTheDocument();
    expect(panel.getByText("Avaliação")).toBeInTheDocument();
    expect(panel.getByText("Nenhuma registrada")).toBeInTheDocument();
  });

  it("client without a cycle, anamnese concluída: next step is the plan, avaliação is never listed as a pending requirement", async () => {
    render(<ClientProfile clientId="c5" />);
    await screen.findByRole("heading", { level: 1 });
    expect(screen.getByText("Próximo: Criar plano")).toBeInTheDocument();
    const panel = within(await screen.findByRole("tabpanel", { name: "Resumo" }));
    expect(panel.getByRole("link", { name: "Criar plano" })).toHaveAttribute(
      "href",
      "/app/clients/c5/accompaniment",
    );
    expect(panel.queryByText(/Falta:/)).not.toBeInTheDocument();
    expect(panel.queryByRole("link", { name: /avalia[cç][aã]o/i })).not.toBeInTheDocument();
  });

  it("avaliação stays reachable as a manual action even when it's not the canonical next step", async () => {
    const user = userEvent.setup();
    render(<ClientProfile clientId="c5" />);
    await screen.findByRole("heading", { level: 1 });
    await user.click(screen.getByLabelText("Mais ações"));
    expect(screen.getByRole("link", { name: "Registrar avaliação" })).toHaveAttribute(
      "href",
      expect.stringContaining("/app/clients/c5/evaluations/new"),
    );
  });

  it("a real, canonically-eligible avaliação pendente (active cycle) still surfaces as the next step", async () => {
    render(<ClientProfile clientId="c7" />);
    await screen.findByRole("heading", { level: 1 });
    expect(screen.getByText("Próximo: Registrar avaliação")).toBeInTheDocument();
    const panel = within(await screen.findByRole("tabpanel", { name: "Resumo" }));
    expect(panel.getByRole("link", { name: "Registrar avaliação" })).toHaveAttribute(
      "href",
      "/app/clients/c7/accompaniment",
    );
  });
});
