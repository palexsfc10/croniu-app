import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AnamnesisReader } from "@/components/app/anamnesis-reader";

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
});
