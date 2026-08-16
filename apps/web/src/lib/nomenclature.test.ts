import { describe, expect, it } from "vitest";
import { planTitle } from "@/lib/capabilities";
import {
  nomenclatureFor,
  recommendedFormKind,
  safeReturnTo,
} from "@/lib/nomenclature";

describe("nomenclatureFor", () => {
  it("adapts personal trainer terms", () => {
    const terms = nomenclatureFor("personal_trainer");
    expect(terms.client).toBe("aluno");
    expect(terms.plan).toBe("plano de acompanhamento");
    expect(terms.plan_review).toBe("revisão do plano");
    expect(terms.plan_ending).toBe("Preparar novo planejamento");
    expect(terms.feedback).toBe("Feedback");
  });

  it("adapts private tutor without clinical or workout terms", () => {
    const terms = nomenclatureFor("private_tutor");
    expect(terms.client).toBe("aluno");
    expect(terms.plan).toBe("plano de aprendizagem");
    expect(terms.session).toBe("aula");
    expect(terms.evaluation).toBe("avaliação");
    expect(terms.intake_form).toBe("cadastro inicial");
  });

  it("adapts consultant terms", () => {
    const terms = nomenclatureFor("consultant");
    expect(terms.client).toBe("cliente");
    expect(terms.session).toBe("atendimento");
    expect(terms.plan).toBe("plano de ação");
  });

  it("adapts physio and aesthetics plan titles", () => {
    expect(nomenclatureFor("physiotherapist").plan).toBe("plano de cuidado/acompanhamento");
    expect(nomenclatureFor("aesthetics").plan).toBe("plano de acompanhamento");
    expect(planTitle("personal_trainer")).toBe("Plano de acompanhamento");
    expect(planTitle("private_tutor")).toBe("Plano de aprendizagem");
  });

  it("falls back safely", () => {
    expect(nomenclatureFor(null).client).toBe("cliente");
    expect(nomenclatureFor("unknown_code").plan).toBe("plano de acompanhamento");
  });
});

describe("recommendedFormKind", () => {
  it("does not recommend physical anamnesis for tutors/consultants", () => {
    expect(recommendedFormKind("private_tutor")).toBe("class_questionnaire");
    expect(recommendedFormKind("consultant")).toBe("simple_registration");
    expect(recommendedFormKind("sports_teacher")).toBe("class_questionnaire");
    expect(recommendedFormKind("sports_teacher", "musculacao")).toBe("class_questionnaire");
  });
});

describe("safeReturnTo", () => {
  it("accepts only same-app paths", () => {
    expect(safeReturnTo("/app/clients/1/accompaniment")).toBe(
      "/app/clients/1/accompaniment",
    );
    expect(safeReturnTo("https://evil.example/")).toBeNull();
    expect(safeReturnTo("//evil.example")).toBeNull();
    expect(safeReturnTo("/login")).toBeNull();
  });
});
