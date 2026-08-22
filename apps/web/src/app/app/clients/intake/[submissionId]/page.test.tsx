import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useParams: () => ({ submissionId: "sub-1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch };
});

import IntakeSubmissionDetailPage from "@/app/app/clients/intake/[submissionId]/page";

function detail(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub-1",
    client_id: null,
    status: "pending_review",
    full_name: "Murilo Macedo",
    phone_normalized: "11999998888",
    email: null,
    birth_date: null,
    primary_goal: "Ganho de massa",
    occupation: null,
    emergency_contact: "Ana · 11911112222",
    initial_notes: null,
    duplicate_client_id: "c-old",
    duplicate_alert: true,
    archived_match: false,
    requires_professional_attention: true,
    rejection_internal_reason: null,
    message_to_client: null,
    submitted_at: "2026-08-13T23:18:00-03:00",
    reviewed_at: null,
    consents: [
      { consent_key: "purpose_science", accepted: true },
      { consent_key: "whatsapp_optional", accepted: true },
    ],
    anamnesis: {
      id: "a1",
      template_version_id: "tv",
      answers_json: {},
      requires_professional_attention: true,
      created_at: "",
      form_name: "Anamnese de atividade física",
      summary: {
        primary_goal: "Ganho de massa",
        experience: "Iniciante",
        modalities: "Musculação",
        availability: "Manhã",
        attention_count: 1,
      },
      questions_snapshot: [
        {
          id: "h_injury",
          label: "Lesão atual",
          section_title: "Saúde declarada",
          answer_label: "Sim — joelho",
          attention: true,
        },
        {
          id: "a_goal",
          label: "Objetivo",
          section_title: "Objetivos",
          answer_label: "Ganho de massa",
          attention: false,
        },
      ],
    },
    ...overrides,
  };
}

describe("intake review order", () => {
  afterEach(() => {
    cleanup();
    apiFetch.mockReset();
  });

  beforeEach(() => {
    apiFetch.mockImplementation(async (path: string) => {
      if (path.includes("/duplicate-candidates")) return { data: [] };
      return { data: detail() };
    });
  });

  it("places decision after anamnesis, alerts, duplicity and consents", async () => {
    render(<IntakeSubmissionDetailPage />);
    expect(await screen.findByRole("heading", { name: "Murilo Macedo" })).toBeInTheDocument();
    expect(screen.getByText("Aguardando análise")).toBeInTheDocument();
    const text = document.body.textContent || "";
    expect(text.indexOf("Resumo do cadastro")).toBeGreaterThan(-1);
    expect(text.indexOf("Resumo do cadastro")).toBeLessThan(text.indexOf("Atenção antes de iniciar"));
    expect(text.indexOf("Atenção antes de iniciar")).toBeLessThan(text.indexOf("Possível cadastro duplicado"));
    expect(text.indexOf("Possível cadastro duplicado")).toBeLessThan(text.indexOf("Consentimentos"));
    expect(text.indexOf("Consentimentos")).toBeLessThan(text.indexOf("Finalizar análise"));
    expect(screen.queryByLabelText(/Motivo interno/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aprovar" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aprovar cadastro" })).toBeInTheDocument();
  });

  it("opens approval in a dialog and keeps reject reason off the page", async () => {
    const user = userEvent.setup();
    render(<IntakeSubmissionDetailPage />);
    await screen.findByRole("heading", { name: "Murilo Macedo" });
    await user.click(screen.getByRole("button", { name: "Aprovar cadastro" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar aprovação" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    await user.click(screen.getByRole("button", { name: "Recusar cadastro" }));
    expect(screen.getByLabelText(/Motivo interno/i)).toBeInTheDocument();
    expect(screen.getByText(/Não é enviado ao aluno/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar recusa" })).toBeInTheDocument();
  });

  it("blocks approval when answers fail to load", async () => {
    apiFetch.mockResolvedValue({ error: { message: "falhou" } });
    render(<IntakeSubmissionDetailPage />);
    expect(await screen.findByText(/Ainda não foi possível carregar as respostas/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aprovar cadastro" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
  });

  it("does not show technical enums", async () => {
    render(<IntakeSubmissionDetailPage />);
    await screen.findByRole("heading", { name: "Murilo Macedo" });
    expect(screen.queryByText("pending_review")).not.toBeInTheDocument();
  });
});

describe("ambiguous duplicate resolution", () => {
  afterEach(() => {
    cleanup();
    apiFetch.mockReset();
  });

  const candidates = [
    { id: "c-a", full_name: "Cliente A", phone: "11911110000", email: null, status: "active" },
    { id: "c-b", full_name: "Cliente B", phone: null, email: "b@example.com", status: "archived" },
  ];

  it("lists every candidate for a human decision instead of a single guess", async () => {
    apiFetch.mockImplementation(async (path: string) => {
      if (path.includes("/duplicate-candidates")) return { data: candidates };
      return { data: detail() };
    });
    render(<IntakeSubmissionDetailPage />);
    await screen.findByText("Possível cadastro duplicado");
    expect(await screen.findByText("Cliente A")).toBeInTheDocument();
    expect(screen.getByText("Cliente B")).toBeInTheDocument();
    expect(screen.getByText("(arquivado)")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Vincular a este aluno" }),
    ).toHaveLength(2);
  });

  it("links to the chosen candidate via POST link-to-client", async () => {
    const user = userEvent.setup();
    apiFetch.mockImplementation(async (path: string) => {
      if (path.includes("/duplicate-candidates")) return { data: candidates };
      if (path.includes("/link-to-client")) {
        return { data: detail({ client_id: "c-a", duplicate_alert: false, duplicate_client_id: null }) };
      }
      return { data: detail() };
    });
    render(<IntakeSubmissionDetailPage />);
    await screen.findByText("Cliente A");
    await user.click(screen.getAllByRole("button", { name: "Vincular a este aluno" })[0]!);
    expect(await screen.findByText("Cadastro vinculado ao aluno existente.")).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/v1/intake-submissions/sub-1/link-to-client",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ client_id: "c-a" }) }),
    );
  });

  it("does not fetch candidates when there is no duplicate alert", async () => {
    apiFetch.mockImplementation(async (path: string) => {
      if (path.includes("/duplicate-candidates")) return { data: candidates };
      return { data: detail({ duplicate_alert: false, duplicate_client_id: null }) };
    });
    render(<IntakeSubmissionDetailPage />);
    await screen.findByRole("heading", { name: "Murilo Macedo" });
    expect(screen.queryByText("Possível cadastro duplicado")).not.toBeInTheDocument();
    const calledCandidatePath = apiFetch.mock.calls.some((call: unknown[]) =>
      String(call[0]).includes("/duplicate-candidates"),
    );
    expect(calledCandidatePath).toBe(false);
  });
});
