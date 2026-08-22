import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AnamnesisReader, isRealAttentionItem } from "@/components/app/anamnesis-reader";

describe("AnamnesisReader", () => {
  it("renders human labels and never exposes technical keys as titles", () => {
    render(
      <AnamnesisReader
        formName="Anamnese de atividade física"
        submittedAt="2026-08-13T12:00:00Z"
        versionNumber={1}
        requiresAttention
        summary={{ primary_goal: "Condicionamento", attention_count: 1 }}
        questions={[
          {
            id: "h_alcohol",
            label: "Consome álcool?",
            section_title: "Hábitos",
            answer: "nao",
            answer_label: "Não",
          },
          {
            id: "d_chest_pain",
            label: "Dor no peito?",
            section_title: "Saúde declarada",
            answer: "sim",
            answer_label: "Sim",
            attention: true,
          },
        ]}
      />,
    );
    expect(screen.getByText("Consome álcool?")).toBeTruthy();
    expect(screen.getByText("Dor no peito?")).toBeTruthy();
    expect(screen.queryByText("h_alcohol")).toBeNull();
    expect(screen.queryByText("d_chest_pain")).toBeNull();
  });

  it("does not count an attention-eligible question answered negatively", () => {
    expect(
      isRealAttentionItem({ id: "d_chest_pain", label: "Dor no peito?", attention: true, answer: "nao" }),
    ).toBe(false);
    expect(
      isRealAttentionItem({
        id: "d_chest_pain",
        label: "Dor no peito?",
        attention: true,
        answer_label: "Não",
      }),
    ).toBe(false);
  });

  it("counts an attention-eligible question actually answered yes", () => {
    expect(
      isRealAttentionItem({ id: "d_chest_pain", label: "Dor no peito?", attention: true, answer: "sim" }),
    ).toBe(true);
    expect(
      isRealAttentionItem({
        id: "d_chest_pain",
        label: "Dor no peito?",
        attention: true,
        answer_label: "Sim — ocasionalmente",
      }),
    ).toBe(true);
  });

  it("counts a raw 'prefiro_detalhar' answer as attention-worthy", () => {
    expect(
      isRealAttentionItem({
        id: "g_other",
        label: "Outra condição?",
        attention: true,
        answer: "prefiro_detalhar",
      }),
    ).toBe(true);
  });

  it("never counts a question not flagged attention, regardless of answer", () => {
    expect(
      isRealAttentionItem({ id: "a_goal", label: "Objetivo", attention: false, answer: "sim" }),
    ).toBe(false);
  });

  it("shows the section as 'N respostas' instead of a false 'pontos para revisar' when nothing is concerning", () => {
    render(
      <AnamnesisReader
        formName="Anamnese"
        summary={{ attention_count: 0 }}
        questions={[
          {
            id: "d_chest_pain",
            label: "Dor no peito?",
            section_title: "Triagem de prontidão para atividade",
            answer: "nao",
            answer_label: "Não",
            attention: true,
          },
          {
            id: "d_dizziness",
            label: "Tontura?",
            section_title: "Triagem de prontidão para atividade",
            answer: "nao",
            answer_label: "Não",
            attention: true,
          },
        ]}
      />,
    );
    expect(screen.getByText("2 respostas")).toBeInTheDocument();
    expect(screen.queryByText(/pontos? para revisar/)).not.toBeInTheDocument();
  });
});
