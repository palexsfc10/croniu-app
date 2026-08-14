import { describe, expect, it } from "vitest";
import { setupCopyFor } from "@/lib/setup-copy";

describe("setupCopyFor", () => {
  it("uses personal trainer examples without saving prices", () => {
    const copy = setupCopyFor("personal_trainer");
    expect(copy.cardTitle).toBe("Prepare seus serviços e ciclos");
    expect(copy.serviceExample).toContain("aula individual");
    expect(copy.templateExample).toContain("2 aulas por semana");
  });

  it("uses tutor examples without workout language", () => {
    const copy = setupCopyFor("private_tutor");
    expect(copy.serviceExample.toLowerCase()).toContain("inglês");
    expect(copy.serviceExample.toLowerCase()).not.toContain("treino");
  });

  it("uses consultant examples", () => {
    const copy = setupCopyFor("consultant");
    expect(copy.serviceExample.toLowerCase()).toContain("consultoria");
    expect(copy.templateExample.toLowerCase()).toContain("acompanhamento");
  });

  it("falls back to generic", () => {
    expect(setupCopyFor(null).cardTitle).toBe("Prepare seu Croniu");
    expect(setupCopyFor("other").serviceNamePlaceholder).toContain("Atendimento");
  });
});
