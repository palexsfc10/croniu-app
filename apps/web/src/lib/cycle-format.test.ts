import { describe, expect, it } from "vitest";
import { formatBRL, formatDateBR } from "@/lib/api";

describe("Sprint 2C formatting", () => {
  it("formats BRL from cents", () => {
    expect(formatBRL(9000)).toMatch(/90/);
    expect(formatBRL(72000)).toMatch(/720/);
  });

  it("formats dates in pt-BR", () => {
    expect(formatDateBR("2026-08-01")).toMatch(/01\/08\/2026|1\/8\/2026/);
  });
});
