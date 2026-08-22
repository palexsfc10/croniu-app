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
