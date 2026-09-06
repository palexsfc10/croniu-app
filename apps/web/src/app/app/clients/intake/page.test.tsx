import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  professionCode: "personal_trainer" as string | null,
  formTitle: "Anamnese de atividade física" as string | null,
}));

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    me: {
      organization: {
        profession_code: authState.professionCode,
        profession_specialty: null,
        form_title: authState.formTitle,
      },
    },
  }),
}));

import { apiFetch } from "@/lib/api";
import ClientsIntakePage from "@/app/app/clients/intake/page";

const EMPTY_BOARD = {
  attention: [],
  invite_pending: [],
  in_progress: [],
  completed: [],
  draft_evaluations: [],
};

const FULL_BOARD = {
  attention: [
    {
      client_id: "c-att",
      client_name: "Cliente Atenção",
      entry_type: "convite",
      stage: "pending_review",
      stage_label: "Aguardando análise",
      requires_professional_attention: true,
      attention_note: "Possível duplicata de cadastro.",
      days_since_update: 3,
      next_action: "review_submission",
      next_action_label: "Analisar cadastro",
      submission_id: "sub-1",
      submission_status: "pending_review",
    },
  ],
  invite_pending: [
    {
      client_id: "c-inv",
      client_name: "Cliente Convite",
      entry_type: "manual",
      stage: "pending_registration",
      stage_label: "Cadastro incompleto",
      requires_professional_attention: false,
      attention_note: null,
      days_since_update: 1,
      next_action: null,
      next_action_label: null,
      submission_id: null,
      submission_status: null,
    },
  ],
  in_progress: [
    {
      client_id: "c-prog",
      client_name: "Cliente Em Preenchimento",
      entry_type: "convite",
      stage: "pending_anamnesis",
      stage_label: "Formulário pendente",
      requires_professional_attention: false,
      attention_note: null,
      days_since_update: 2,
      next_action: "update_anamnesis",
      next_action_label: "Atualizar formulário",
      submission_id: null,
      submission_status: null,
    },
  ],
  completed: [
    {
      client_id: "c-done",
      client_name: "Cliente Concluído",
      entry_type: "manual",
      stage: "active",
      stage_label: "Em acompanhamento",
      requires_professional_attention: false,
      attention_note: null,
      days_since_update: 10,
      next_action: null,
      next_action_label: null,
      submission_id: null,
      submission_status: null,
    },
  ],
  draft_evaluations: [
    {
      evaluation_id: "ev-1",
      client_id: "c-done",
      client_name: "Cliente Concluído",
      title: "Avaliação de setembro",
      updated_at: "2026-09-01T12:00:00Z",
    },
  ],
};

function mockApi({ link = { has_active_link: false }, board = EMPTY_BOARD }: { link?: unknown; board?: unknown } = {}) {
  vi.mocked(apiFetch).mockImplementation(async (path: string) => {
    if (path === "/api/v1/intake-link") return { data: link, error: undefined, status: 200 };
    if (path === "/api/v1/clients/onboarding-board")
      return { data: board, error: undefined, status: 200 };
    return { data: null, error: { code: "not_found", message: "unexpected path" }, status: 404 };
  });
}

describe("ClientsIntakePage — central operacional de onboarding de clientes", () => {
  beforeEach(() => {
    authState.professionCode = "personal_trainer";
    authState.formTitle = "Anamnese de atividade física";
    vi.mocked(apiFetch).mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("keeps the page title stable regardless of profession — never a fabricated per-profession heading", () => {
    mockApi();
    render(<ClientsIntakePage />);
    expect(screen.getByRole("heading", { name: "Onboarding de clientes" })).toBeInTheDocument();
    expect(screen.getByText(/Formulário: Anamnese de atividade física\./)).toBeInTheDocument();
  });

  it("never calls /organization/profession — the session already carries the nomenclature fields", async () => {
    mockApi();
    render(<ClientsIntakePage />);
    await screen.findByText(/Nenhum cliente exigindo atenção/);
    const calls = vi.mocked(apiFetch).mock.calls.map(([path]) => path);
    expect(calls).not.toContain("/api/v1/organization/profession");
  });

  it("fetches the real onboarding board endpoint, not the old pending-submissions queue", async () => {
    mockApi();
    render(<ClientsIntakePage />);
    await screen.findByText(/Nenhum cliente exigindo atenção/);
    const calls = vi.mocked(apiFetch).mock.calls.map(([path]) => path);
    expect(calls).toContain("/api/v1/clients/onboarding-board");
    expect(calls).not.toContain("/api/v1/intake-submissions?status=pending_review");
  });

  it("renders all four real groups on desktop with real client names, never invented pendency", async () => {
    mockApi({ board: FULL_BOARD });
    const { container } = render(<ClientsIntakePage />);
    const desktop = container.querySelector(".hidden.lg\\:block") as HTMLElement;
    await within(desktop).findByText("Cliente Atenção");
    expect(within(desktop).getByText("Cliente Convite")).toBeInTheDocument();
    expect(within(desktop).getByText("Cliente Em Preenchimento")).toBeInTheDocument();
    expect(within(desktop).getByText("Cliente Concluído")).toBeInTheDocument();
    expect(
      within(desktop).getByRole("heading", { name: "Exige atenção 1" }),
    ).toBeInTheDocument();
  });

  it("links the attention group's next action to the real submission review, not a generic page", async () => {
    mockApi({ board: FULL_BOARD });
    const { container } = render(<ClientsIntakePage />);
    const desktop = container.querySelector(".hidden.lg\\:block") as HTMLElement;
    await within(desktop).findByText("Cliente Atenção");
    const row = within(desktop).getByText("Cliente Atenção").closest("tr") as HTMLElement;
    expect(within(row).getByRole("link", { name: "Analisar cadastro" })).toHaveAttribute(
      "href",
      "/app/clients/intake/sub-1",
    );
  });

  it("shows a mobile digest — not a compressed desktop table — with attention/in-progress merged and drafts separate", async () => {
    mockApi({ board: FULL_BOARD });
    const { container } = render(<ClientsIntakePage />);
    const mobile = container.querySelector(".lg\\:hidden") as HTMLElement;
    await within(mobile).findByText("Cliente Atenção");
    expect(within(mobile).getByText("Cliente Em Preenchimento")).toBeInTheDocument();
    expect(within(mobile).getByText("Cliente Convite")).toBeInTheDocument();
    expect(within(mobile).getByText("Avaliação de setembro")).toBeInTheDocument();
    expect(within(mobile).getByRole("link", { name: "Continuar rascunho" })).toHaveAttribute(
      "href",
      "/app/clients/c-done/evaluations/ev-1",
    );
  });

  it("offers a manual-registration entry point alongside the invite link", () => {
    mockApi();
    render(<ClientsIntakePage />);
    expect(
      screen.getByRole("link", { name: "Cadastrar cliente manualmente" }),
    ).toHaveAttribute("href", "/app/clients/new");
  });
});
