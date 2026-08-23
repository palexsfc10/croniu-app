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
      return { data: detail({ duplicate_alert: false, duplicate_client_id: null }) };
    });
  });

  it("places decision after anamnesis and consents for a resolvable submission", async () => {
    render(<IntakeSubmissionDetailPage />);
    expect(await screen.findByRole("heading", { name: "Murilo Macedo" })).toBeInTheDocument();
    expect(screen.getByText("Aguardando análise")).toBeInTheDocument();
    const text = document.body.textContent || "";
    expect(text.indexOf("Resumo do cadastro")).toBeGreaterThan(-1);
    expect(text.indexOf("Resumo do cadastro")).toBeLessThan(text.indexOf("Atenção antes de iniciar"));
    expect(text.indexOf("Atenção antes de iniciar")).toBeLessThan(text.indexOf("Consentimentos"));
    expect(text.indexOf("Consentimentos")).toBeLessThan(text.indexOf("Finalizar análise"));
    expect(screen.queryByLabelText(/Motivo interno/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aprovar" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aprovar cadastro" })).toBeInTheDocument();
  });

  it("places the duplicate-review section after alerts, and blocks the decision section while ambiguous", async () => {
    apiFetch.mockImplementation(async (path: string) => {
      if (path.includes("/duplicate-candidates")) return { data: [] };
      return { data: detail() }; // default fixture: duplicate_alert true
    });
    render(<IntakeSubmissionDetailPage />);
    await screen.findByRole("heading", { name: "Murilo Macedo" });
    const text = document.body.textContent || "";
    expect(text.indexOf("Atenção antes de iniciar")).toBeLessThan(
      text.indexOf("Possível cadastro duplicado"),
    );
    expect(text.indexOf("Possível cadastro duplicado")).toBeLessThan(text.indexOf("Consentimentos"));
    expect(screen.queryByText("Finalizar análise")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aprovar cadastro" })).not.toBeInTheDocument();
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

  it("explains the ambiguity and offers both explicit decisions", async () => {
    apiFetch.mockImplementation(async (path: string) => {
      if (path.includes("/duplicate-candidates")) return { data: candidates };
      return { data: detail() };
    });
    render(<IntakeSubmissionDetailPage />);
    await screen.findByText("Possível cadastro duplicado");
    expect(
      screen.getByText(/Encontramos mais de um aluno com dados semelhantes/i),
    ).toBeInTheDocument();
    expect(await screen.findByText("Cliente A")).toBeInTheDocument();
    expect(screen.getByText("Cliente B")).toBeInTheDocument();
    expect(screen.getByText("(arquivado)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Manter como novo aluno" })).toBeInTheDocument();
  });

  it("disables linking to an archived candidate instead of reactivating it silently", async () => {
    apiFetch.mockImplementation(async (path: string) => {
      if (path.includes("/duplicate-candidates")) return { data: candidates };
      return { data: detail() };
    });
    render(<IntakeSubmissionDetailPage />);
    await screen.findByText("Cliente B");
    const buttons = screen.getAllByRole("button", { name: "Vincular a este aluno" });
    // c-a (active) is buttons[0], c-b (archived) is buttons[1] — order follows `candidates`.
    expect(buttons[1]).toBeDisabled();
    expect(buttons[0]).not.toBeDisabled();
    expect(screen.getByText(/Reative este aluno em Arquivados/i)).toBeInTheDocument();
  });

  it("hides the normal approve/reject decision section while still ambiguous", async () => {
    apiFetch.mockImplementation(async (path: string) => {
      if (path.includes("/duplicate-candidates")) return { data: candidates };
      return { data: detail() };
    });
    render(<IntakeSubmissionDetailPage />);
    await screen.findByText("Possível cadastro duplicado");
    expect(screen.queryByRole("button", { name: "Aprovar cadastro" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Recusar cadastro" })).not.toBeInTheDocument();
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
    // The decision section reappears once resolved.
    expect(await screen.findByRole("button", { name: "Aprovar cadastro" })).toBeInTheDocument();
  });

  it("keeps the submission as a new client via an explicit, separate action", async () => {
    const user = userEvent.setup();
    apiFetch.mockImplementation(async (path: string) => {
      if (path.includes("/duplicate-candidates")) return { data: candidates };
      if (path.includes("/keep-as-new-client")) {
        return { data: detail({ duplicate_alert: false, duplicate_client_id: null }) };
      }
      return { data: detail() };
    });
    render(<IntakeSubmissionDetailPage />);
    await screen.findByRole("button", { name: "Manter como novo aluno" });
    await user.click(screen.getByRole("button", { name: "Manter como novo aluno" }));
    expect(await screen.findByText("Cadastro mantido como novo aluno.")).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/v1/intake-submissions/sub-1/keep-as-new-client",
      expect.objectContaining({ method: "POST" }),
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

describe("request changes — error visibility and share actions", () => {
  afterEach(() => {
    cleanup();
    apiFetch.mockReset();
  });

  beforeEach(() => {
    apiFetch.mockImplementation(async (path: string) => {
      if (path.includes("/duplicate-candidates")) return { data: [] };
      return { data: detail({ duplicate_alert: false, duplicate_client_id: null, client_id: "c1" }) };
    });
  });

  it("shows a real error inside the sheet and keeps it open when the backend rejects the request", async () => {
    const user = userEvent.setup();
    apiFetch.mockImplementation(async (path: string) => {
      if (path.includes("/duplicate-candidates")) return { data: [] };
      if (path.endsWith("/request-changes")) {
        return { error: { code: "invalid_transition", message: "Não foi possível salvar." } };
      }
      return { data: detail({ duplicate_alert: false, duplicate_client_id: null, client_id: "c1" }) };
    });
    render(<IntakeSubmissionDetailPage />);
    await user.click(await screen.findByRole("button", { name: "Solicitar ajuste" }));
    const textarea = screen.getByLabelText("Mensagem ao aluno");
    await user.type(textarea, "Indique os objetivos secundários.");
    await user.click(screen.getByRole("button", { name: "Enviar pedido" }));

    // Modal stays open, error is visible, typed message is preserved —
    // this is the exact bug: previously nothing was shown at all.
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível salvar.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Mensagem ao aluno")).toHaveValue(
      "Indique os objetivos secundários.",
    );
  });

  it("closes the sheet, confirms success, and offers WhatsApp/copy after a successful request", async () => {
    const user = userEvent.setup();
    apiFetch.mockImplementation(async (path: string) => {
      if (path.includes("/duplicate-candidates")) return { data: [] };
      if (path.endsWith("/request-changes")) {
        return {
          data: detail({
            status: "changes_requested",
            client_id: "c1",
            message_to_client: "Indique os objetivos secundários.",
            duplicate_alert: false,
            duplicate_client_id: null,
          }),
        };
      }
      if (path === "/api/v1/clients/c1/intake-link") {
        return {
          data: {
            client_id: "c1",
            full_name: "Murilo Macedo",
            token: "ci1.a.b.c",
            public_path: "/entrar/ci1.a.b.c",
            public_url: "https://app.croniu.com.br/entrar/ci1.a.b.c",
            wa_message_url: "https://wa.me/?text=x",
          },
        };
      }
      return { data: detail({ duplicate_alert: false, duplicate_client_id: null, client_id: "c1" }) };
    });
    render(<IntakeSubmissionDetailPage />);
    await user.click(await screen.findByRole("button", { name: "Solicitar ajuste" }));
    await user.type(screen.getByLabelText("Mensagem ao aluno"), "Indique os objetivos secundários.");
    await user.click(screen.getByRole("button", { name: "Enviar pedido" }));

    expect(await screen.findByText("Ajustes solicitados ao aluno.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Enviar pelo WhatsApp" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copiar link de correção" })).toBeInTheDocument();
    // Never expose the raw token/URL directly in the interface.
    expect(screen.queryByText("https://app.croniu.com.br/entrar/ci1.a.b.c")).not.toBeInTheDocument();
  });
});

describe("attention items reflect actual answers, not just eligibility", () => {
  afterEach(() => {
    cleanup();
    apiFetch.mockReset();
  });

  it("does not show the attention card when every attention-eligible question was answered negatively", async () => {
    apiFetch.mockImplementation(async (path: string) => {
      if (path.includes("/duplicate-candidates")) return { data: [] };
      return {
        data: detail({
          duplicate_alert: false,
          duplicate_client_id: null,
          anamnesis: {
            id: "a1",
            template_version_id: "tv",
            answers_json: {},
            requires_professional_attention: false,
            created_at: "",
            form_name: "Anamnese de atividade física",
            summary: {
              primary_goal: "Ganho de massa",
              attention_count: 0,
            },
            questions_snapshot: [
              {
                id: "d_chest_pain",
                label: "Sente dor no peito?",
                section_title: "Triagem de prontidão para atividade",
                answer: "nao",
                answer_label: "Não",
                attention: true,
              },
              {
                id: "d_dizziness",
                label: "Sente tontura?",
                section_title: "Triagem de prontidão para atividade",
                answer: "nao",
                answer_label: "Não",
                attention: true,
              },
            ],
          },
        }),
      };
    });
    render(<IntakeSubmissionDetailPage />);
    await screen.findByRole("heading", { name: "Murilo Macedo" });
    expect(screen.queryByText("Atenção antes de iniciar")).not.toBeInTheDocument();
    expect(
      screen.getByText("Nenhum ponto de atenção identificado no formulário."),
    ).toBeInTheDocument();
  });
});
