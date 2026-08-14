import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QuestionField } from "@/components/intake/question-field";

describe("QuestionField", () => {
  it("keeps the label visible and does not treat placeholder as a value", () => {
    render(
      <QuestionField
        question={{
          id: "b_past_difficulties",
          label: "Quais dificuldades você já teve?",
          type: "long_text",
          help_text: "Pode ser sobre execução, organização, motivação ou acompanhamento.",
          placeholder: "Ex.: não sabia quais exercícios fazer ou em que ordem.",
          optional: true,
        }}
        value=""
        onChange={() => undefined}
      />,
    );
    expect(screen.getByText("Quais dificuldades você já teve? (opcional)")).toBeInTheDocument();
    expect(
      screen.getByText("Pode ser sobre execução, organização, motivação ou acompanhamento."),
    ).toBeInTheDocument();
    const box = screen.getByPlaceholderText(
      "Ex.: não sabia quais exercícios fazer ou em que ordem.",
    );
    expect(box).toHaveValue("");
  });
});
