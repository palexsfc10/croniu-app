import { describe, expect, it } from "vitest";
import { firstName, greetingForHour } from "@/lib/greeting";

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
});
