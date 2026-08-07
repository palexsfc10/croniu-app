import { describe, expect, it } from "vitest";
import { firstName, greetingForHour, personalGreeting } from "@/lib/greeting";

describe("greeting", () => {
  it("maps hours to Bom dia / Boa tarde / Boa noite", () => {
    expect(greetingForHour(5)).toBe("Bom dia");
    expect(greetingForHour(11)).toBe("Bom dia");
    expect(greetingForHour(12)).toBe("Boa tarde");
    expect(greetingForHour(17)).toBe("Boa tarde");
    expect(greetingForHour(18)).toBe("Boa noite");
    expect(greetingForHour(4)).toBe("Boa noite");
  });

  it("extracts first name", () => {
    expect(firstName("Maria Silva")).toBe("Maria");
    expect(firstName("  ")).toBeNull();
  });

  it("builds personal greeting with timezone", () => {
    const morning = new Date("2026-03-15T10:00:00.000Z");
    expect(personalGreeting("Pedro Oliveira", "America/Sao_Paulo", morning)).toEqual({
      headline: "Bom dia, Pedro",
      first: "Pedro",
    });
    expect(personalGreeting(undefined, "America/Sao_Paulo", morning)).toEqual({
      headline: "Olá",
      first: null,
    });
  });
});
