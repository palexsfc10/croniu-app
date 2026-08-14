import { describe, expect, it } from "vitest";
import { evaluationGuidance, planGuidance, routineTypes } from "@/lib/form-guidance";

describe("form guidance", () => {
  it("varies evaluation titles by profession with a neutral fallback", () => {
    expect(evaluationGuidance(null).titlePlaceholder).toContain("Avaliação mensal");
    expect(evaluationGuidance("personal_trainer").titleSuggestions.map((c) => c.label)).toContain(
      "Avaliação inicial",
    );
    expect(evaluationGuidance("nutritionist").titleSuggestions.map((c) => c.label)).toContain(
      "Retorno mensal",
    );
    expect(evaluationGuidance("consultant").titleSuggestions.map((c) => c.label)).toContain(
      "Revisão de resultados",
    );
  });

  it("does not promise workout authoring in plan copy", () => {
    const trainer = planGuidance("personal_trainer");
    expect(trainer.title).toBe("Plano de acompanhamento");
    expect(trainer.externalLinkHint.toLowerCase()).toContain("link");
    expect(planGuidance("consultant").title).toBe("Plano de ação");
    expect(routineTypes(false).some((row) => row.label.includes("trocar treino"))).toBe(false);
    expect(routineTypes(true).some((row) => row.value === "swap_training")).toBe(true);
  });
});
