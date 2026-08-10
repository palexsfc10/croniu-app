import { describe, expect, it } from "vitest";
import { formatConflictLine, formatConflictLines } from "@/lib/api";

describe("formatConflictLine timezone", () => {
  it("renders America/Sao_Paulo local time instead of raw UTC ISO", () => {
    const line = formatConflictLine(
      {
        client_name: "Sabrina",
        starts_at: "2026-08-14T12:00:00+00:00",
      },
      "America/Sao_Paulo",
    );
    expect(line).toContain("Sabrina");
    expect(line).toMatch(/09:00/);
    expect(line).not.toContain("+00:00");
    expect(line).not.toContain("T12:00");
  });

  it("formats a list of conflicts", () => {
    const lines = formatConflictLines(
      [
        { client_name: "A", starts_at: "2026-08-14T12:00:00Z" },
        { client_name: "B", starts_at: "2026-08-21T12:00:00Z" },
      ],
      "America/Sao_Paulo",
    );
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/09:00/);
    expect(lines[1]).toMatch(/09:00/);
  });
});
