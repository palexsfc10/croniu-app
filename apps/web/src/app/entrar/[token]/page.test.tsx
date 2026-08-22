import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useParams: () => ({ token: "intake-tok" }),
}));

vi.mock("@/components/brand/brand-wordmark", () => ({
  BrandWordmark: () => <span>Croniu</span>,
}));

import PublicIntakePage from "@/app/entrar/[token]/page";

describe("Public intake page", () => {
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
          professional_public_name: "Studio Alpha",
          welcome_message: "Bem-vindo ao cadastro.",
          process_summary: "Preencha identificação, anamnese e consentimentos.",
          template_version_id: "tv1",
          attention_client_message: "Alguns pontos precisam de análise.",
          anamnesis_schema: {
            sections: [
              {
                id: "A",
                title: "Objetivos",
                questions: [
                  {
                    id: "a_primary_goal",
                    label: "Objetivo",
                    type: "text",
                    required: true,
                  },
                ],
              },
              {
                id: "J",
                title: "Consentimentos",
                questions: [],
                consents: [
                  {
                    key: "purpose_science",
                    required: true,
                    label: "Declaro ciência da finalidade.",
                  },
                ],
              },
            ],
          },
        }),
      })),
    );
  });

  it("shows professional welcome without organization id", async () => {
    render(<PublicIntakePage />);
    expect(await screen.findByText(/Studio Alpha/i)).toBeInTheDocument();
    expect(screen.getByText(/Bem-vindo ao cadastro/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Começar/i })).toBeInTheDocument();
    expect(screen.queryByText(/organization/i)).not.toBeInTheDocument();
  });
});

describe("Public intake page — contextual invite prefill", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("prefills identity fields from a contextual invite without forcing them", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          professional_public_name: "Studio Alpha",
          welcome_message: "Bem-vindo ao cadastro.",
          process_summary: "Preencha identificação, anamnese e consentimentos.",
          template_version_id: "tv1",
          attention_client_message: "Alguns pontos precisam de análise.",
          anamnesis_schema: { sections: [] },
          prefill_full_name: "Sabrina Macedo",
          prefill_email: "sabrina@example.com",
          prefill_phone: "11988887777",
        }),
      })),
    );
    render(<PublicIntakePage />);
    await screen.findByText(/Studio Alpha/i);
    fireEvent.click(screen.getByRole("button", { name: /Começar/i }));

    expect(await screen.findByDisplayValue("Sabrina Macedo")).toBeInTheDocument();
    expect(screen.getByDisplayValue("sabrina@example.com")).toBeInTheDocument();
    expect(screen.getByDisplayValue("11988887777")).toBeInTheDocument();
  });
});

describe("Public intake page — correction (changes requested)", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows the professional's message and offers to continue the correction", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          professional_public_name: "Studio Alpha",
          welcome_message: "Bem-vindo ao cadastro.",
          process_summary: "Preencha identificação, anamnese e consentimentos.",
          template_version_id: "tv1",
          attention_client_message: "Alguns pontos precisam de análise.",
          anamnesis_schema: { sections: [] },
          prefill_full_name: "Murilo Macedo",
          correction_message: "Indique os objetivos secundários.",
          prefill_answers: { d_chest_pain: "nao" },
        }),
      })),
    );
    render(<PublicIntakePage />);
    expect(
      await screen.findByText(/Ajuste solicitado pelo seu profissional:/),
    ).toBeInTheDocument();
    expect(screen.getByText("Indique os objetivos secundários.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuar correção" })).toBeInTheDocument();
  });

  it("does not show the correction banner for a plain first-time invite", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          professional_public_name: "Studio Alpha",
          welcome_message: "Bem-vindo ao cadastro.",
          process_summary: "Preencha identificação, anamnese e consentimentos.",
          template_version_id: "tv1",
          attention_client_message: "Alguns pontos precisam de análise.",
          anamnesis_schema: { sections: [] },
        }),
      })),
    );
    render(<PublicIntakePage />);
    await screen.findByText(/Studio Alpha/i);
    expect(
      screen.queryByText(/Ajuste solicitado pelo seu profissional:/),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Começar" })).toBeInTheDocument();
  });

  it("shows the resubmission-specific success message after a correction is sent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: { method?: string }) => {
        if (init?.method === "POST") {
          return {
            ok: true,
            json: async () => ({
              submission_id: "sub-1",
              client_id: "c1",
              status: "pending_review",
              requires_professional_attention: false,
              portal_path: "/c/tok-portal",
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            professional_public_name: "Studio Alpha",
            welcome_message: "Bem-vindo ao cadastro.",
            process_summary: "Preencha identificação, anamnese e consentimentos.",
            template_version_id: "tv1",
            attention_client_message: "Alguns pontos precisam de análise.",
            anamnesis_schema: { sections: [] },
            correction_message: "Indique os objetivos secundários.",
          }),
        };
      }),
    );
    render(<PublicIntakePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Continuar correção" }));

    fireEvent.change(screen.getByLabelText("Nome completo *"), {
      target: { value: "Murilo Macedo" },
    });
    fireEvent.change(screen.getByLabelText("Telefone / WhatsApp *"), {
      target: { value: "11988887777" },
    });
    fireEvent.change(screen.getByLabelText("Objetivo principal *"), {
      target: { value: "Emagrecimento" },
    });
    fireEvent.click(
      screen.getByLabelText("Confirmo que tenho 18 anos ou mais (se não informar a data de nascimento)"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    fireEvent.click(await screen.findByRole("button", { name: "Continuar" }));

    fireEvent.click(
      await screen.findByLabelText("Declaro ciência da finalidade deste cadastro."),
    );
    fireEvent.click(
      screen.getByLabelText(
        "Autorizo o tratamento dos dados que informei, apenas para este profissional.",
      ),
    );
    fireEvent.click(screen.getByLabelText("Li e aceito a política de privacidade."));
    fireEvent.click(await screen.findByRole("button", { name: "Revisar" }));

    fireEvent.click(await screen.findByRole("button", { name: "Enviar cadastro" }));

    expect(
      await screen.findByText(
        "Ajustes enviados. Seu profissional será avisado para revisar novamente.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Cadastro enviado")).not.toBeInTheDocument();
  });
});
