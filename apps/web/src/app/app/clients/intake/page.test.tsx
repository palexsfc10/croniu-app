import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  professionCode: "personal_trainer" as string | null,
  formTitle: "Anamnese de atividade física" as string | null,
  queueReceived: "Anamnese recebida" as string | null,
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
        queue_received: authState.queueReceived,
      },
    },
  }),
}));

import { apiFetch } from "@/lib/api";
import ClientsIntakePage from "@/app/app/clients/intake/page";

function mockApi({
  link = { has_active_link: false },
  items = [],
}: { link?: unknown; items?: unknown[] } = {}) {
  vi.mocked(apiFetch).mockImplementation(async (path: string) => {
    if (path === "/api/v1/intake-link") return { data: link, error: undefined, status: 200 };
    if (path === "/api/v1/intake-submissions?status=pending_review")
      return { data: items, error: undefined, status: 200 };
    return { data: null, error: { code: "not_found", message: "unexpected path" }, status: 404 };
  });
}

describe("ClientsIntakePage — nomenclature has no flash", () => {
  beforeEach(() => {
    authState.professionCode = "personal_trainer";
    authState.formTitle = "Anamnese de atividade física";
    authState.queueReceived = "Anamnese recebida";
    vi.mocked(apiFetch).mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders personal-trainer nomenclature on the very first synchronous render", () => {
    mockApi();
    render(<ClientsIntakePage />);
    // No `await`/`findBy`: the queue heading, form title and page title must
    // already be correct before any network call resolves.
    expect(screen.getByRole("heading", { name: "Novos alunos" })).toBeInTheDocument();
    expect(
      screen.getByText(/Formulário: Anamnese de atividade física\./),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Anamnese recebida" })).toBeInTheDocument();
  });

  it("shows a different profession's nomenclature, without forcing personal-trainer terms", () => {
    authState.professionCode = "nutritionist";
    authState.formTitle = "Ficha inicial de acompanhamento nutricional";
    authState.queueReceived = "Ficha de acompanhamento recebida";
    mockApi();
    render(<ClientsIntakePage />);
    expect(screen.getByRole("heading", { name: "Novos clientes" })).toBeInTheDocument();
    expect(
      screen.getByText(/Formulário: Ficha inicial de acompanhamento nutricional\./),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ficha de acompanhamento recebida" })).toBeInTheDocument();
  });

  it("falls back to a generic queue label only, never a wrong specific one, when the profile has no queue_received", () => {
    authState.professionCode = null;
    authState.formTitle = null;
    authState.queueReceived = null;
    mockApi();
    render(<ClientsIntakePage />);
    expect(screen.getByRole("heading", { name: "Cadastro recebido" })).toBeInTheDocument();
  });

  it("never calls /organization/profession — the session already carries the nomenclature fields", async () => {
    mockApi();
    render(<ClientsIntakePage />);
    await screen.findByText("Nenhum cadastro pendente");
    const calls = vi.mocked(apiFetch).mock.calls.map(([path]) => path);
    expect(calls).not.toContain("/api/v1/organization/profession");
  });
});
