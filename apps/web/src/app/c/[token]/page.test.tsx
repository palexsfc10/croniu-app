import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({
  useParams: () => ({ token: "tok123" }),
}));

vi.mock("@/components/brand/brand-wordmark", () => ({
  BrandWordmark: () => <span>Croniu</span>,
}));

import PublicMyCyclePage from "@/app/c/[token]/page";

describe("Public Meu Ciclo page", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          professional_display_name: "Studio",
          client_first_name: "Renata",
          cycle: {
            service_name: "Personal",
            status_summary: "encerrando",
            starts_on: "2026-08-01",
            ends_on: "2026-09-01",
            lesson_count: 8,
            remaining_planned_lessons: 1,
            lessons_completed: 7,
            value_cents: 72000,
            payment_status: "pendente",
          },
          payment_instructions: { configured: false },
          can_request_renewal: true,
          can_report_payment: true,
          plan: {
            section_title: "Plano de acompanhamento",
            title: "Estratégia do período",
            summary: "Foco em consistência",
            starts_on: "2026-08-01",
            ends_on: "2026-11-21",
            milestones: ["4 semanas — consistência"],
            external_url: "https://example.com/treino",
            external_title: "Material do período",
          },
          evaluations: [
            {
              title: "Evolução de julho",
              summary: "Bom progresso",
              achievements: "Rotina firme",
              next_goals: "Manter consistência",
              client_message: "Parabéns!",
              criteria: [{ name: "Consistência", score: 4, scale_max: 5 }],
            },
          ],
        }),
      })),
    );
  });

  it("renders cycle without internal ids", async () => {
    render(<PublicMyCyclePage />);
    expect(await screen.findByText(/Olá, Renata/i)).toBeInTheDocument();
    expect(screen.getByText(/Personal/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Quero continuar/i })).toBeInTheDocument();
    expect(screen.queryByText(/organization/i)).not.toBeInTheDocument();
  });

  it("renders published plan without draft or internal fields", async () => {
    render(<PublicMyCyclePage />);
    expect(await screen.findByRole("heading", { name: "Plano de acompanhamento" })).toBeInTheDocument();
    expect(screen.getByText("Estratégia do período")).toBeInTheDocument();
    expect(screen.getByText("Foco em consistência")).toBeInTheDocument();
    expect(screen.getByText("4 semanas — consistência")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Material do período" })).toHaveAttribute(
      "href",
      "https://example.com/treino",
    );
    expect(screen.queryByText(/rascunho/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/organization_id/i)).not.toBeInTheDocument();
  });

  it("renders published evolution without private notes", async () => {
    render(<PublicMyCyclePage />);
    expect(await screen.findByText(/Sua evolução/i)).toBeInTheDocument();
    expect(screen.getByText(/Evolução de julho/i)).toBeInTheDocument();
    expect(screen.getByText(/Bom progresso/i)).toBeInTheDocument();
    expect(screen.getByText(/Próximo foco/i)).toBeInTheDocument();
    expect(screen.getByText(/Bom ritmo/i)).toBeInTheDocument();
    expect(screen.queryByText(/private/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/SEGREDO/i)).not.toBeInTheDocument();
  });
});

describe("changes-requested pending correction card", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  function stubFetch(intakeStatus: Record<string, unknown>, myCycleOk = false) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/public/intake/portal/")) {
          return { ok: true, json: async () => intakeStatus };
        }
        if (myCycleOk) {
          return {
            ok: true,
            json: async () => ({
              professional_display_name: "Studio",
              client_first_name: "Renata",
              cycle: {
                service_name: "Personal",
                status_summary: "vigente",
                starts_on: "2026-08-01",
                ends_on: "2026-09-01",
                lesson_count: 8,
                value_cents: 72000,
                payment_status: "pendente",
              },
              payment_instructions: { configured: false },
              evaluations: [],
            }),
          };
        }
        return { ok: false, json: async () => ({ message: "sem ciclo" }) };
      }),
    );
  }

  it("shows the pending-correction card with the message and a CTA when there is no cycle", async () => {
    stubFetch({
      journey_stage: "active",
      journey_label: "Em acompanhamento",
      submission_status: "changes_requested",
      message_to_client: "Indique os objetivos secundários.",
      client_first_name: "Murilo",
      correction_path: "/entrar/ci1.abc",
      correction_url: "https://app.croniu.com.br/entrar/ci1.abc",
    });
    render(<PublicMyCyclePage />);
    expect(await screen.findByText("Seu profissional solicitou alguns ajustes")).toBeInTheDocument();
    expect(screen.getByText("Indique os objetivos secundários.")).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: "Corrigir cadastro" });
    expect(cta).toHaveAttribute("href", "/entrar/ci1.abc");
    // The old, generic fallback text must not appear alongside it.
    expect(
      screen.queryByText(/profissional está analisando as informações/i),
    ).not.toBeInTheDocument();
  });

  it("shows the pending-correction card even when an active cycle already exists", async () => {
    stubFetch(
      {
        journey_stage: "active",
        journey_label: "Em acompanhamento",
        submission_status: "changes_requested",
        message_to_client: "Confirme seu contato de emergência.",
        client_first_name: "Renata",
        correction_path: "/entrar/ci1.def",
        correction_url: "https://app.croniu.com.br/entrar/ci1.def",
      },
      true,
    );
    render(<PublicMyCyclePage />);
    expect(await screen.findByText("Seu profissional solicitou alguns ajustes")).toBeInTheDocument();
    // Cycle content is not hidden by the pending correction.
    expect(await screen.findByText(/Personal/)).toBeInTheDocument();
  });

  it("does not show the correction card when nothing is pending", async () => {
    stubFetch(
      {
        journey_stage: "active",
        journey_label: "Em acompanhamento",
        submission_status: "approved",
        client_first_name: "Renata",
      },
      true,
    );
    render(<PublicMyCyclePage />);
    await screen.findByText(/Personal/);
    expect(
      screen.queryByText("Seu profissional solicitou alguns ajustes"),
    ).not.toBeInTheDocument();
  });
});
