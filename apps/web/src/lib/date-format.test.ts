import { describe, expect, it } from "vitest";
import { formatCycleDetailLines, formatCycleVigencyCard, formatHumanDateRange, formatNextLessonLine, lastInclusiveIso, rangesOverlap } from "@/lib/date-format";
import { filterCycles, type CycleBucket } from "@/lib/cycle-period";
import type { Cycle } from "@/lib/api";

function cycle(partial: Partial<Cycle> & Pick<Cycle, "id" | "starts_on" | "ends_on" | "status">): Cycle {
  return {
    client_id: "c1",
    service_id: "s1",
    cycle_type: "period",
    value_cents: 1000,
    notes: null,
    last_contacted_at: null,
    contact_confirmed_at: null,
    created_at: "",
    updated_at: "",
    client_name: "Pedro",
    service_name: "Aula",
    days_remaining: 9,
    is_nearing_end: false,
    ...partial,
  };
}

describe("date-format", () => {
  it("formats ranges without ISO arrows", () => {
    const text = formatHumanDateRange("2026-08-17", "2026-09-17");
    expect(text).toBe("17 ago. a 17 set.");
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    const card = formatCycleVigencyCard("2026-08-17", "2026-09-17");
    expect(card.range).toBe("17 ago. a 16 set.");
    expect(card.renewal).toBe("Renovação em 17 set.");
    expect(lastInclusiveIso("2026-09-17")).toBe("2026-09-16");
    expect(lastInclusiveIso("2026-03-01")).toBe("2026-02-28");
    expect(lastInclusiveIso("2024-03-01")).toBe("2024-02-29");
    expect(lastInclusiveIso("2027-01-01")).toBe("2026-12-31");
    const detail = formatCycleDetailLines("2026-08-17", "2026-09-17");
    expect(detail.vigency).toBe("Vigência: 17/08 a 16/09");
    expect(detail.lessonsUntil).toBe("Aulas até 16/09");
    expect(detail.renewal).toBe("Renovação em 17/09");
  });

  it("detects overlap across the full period", () => {
    expect(rangesOverlap("2026-08-01", "2026-09-30", "2026-08-17", "2026-09-17")).toBe(true);
    expect(rangesOverlap("2026-10-01", "2026-10-31", "2026-08-17", "2026-09-17")).toBe(false);
  });
});

describe("cycle-period", () => {
  const spanning = cycle({
    id: "span",
    status: "active",
    starts_on: "2026-08-01",
    ends_on: "2026-09-30",
  });
  const outside = cycle({
    id: "out",
    status: "ended",
    starts_on: "2026-01-01",
    ends_on: "2026-01-31",
  });

  it("includes cycles that start, end or span the window", () => {
    const starts = cycle({ id: "s", status: "active", starts_on: "2026-08-20", ends_on: "2026-10-01" });
    const ends = cycle({ id: "e", status: "active", starts_on: "2026-07-01", ends_on: "2026-08-20" });
    const span = cycle({ id: "x", status: "active", starts_on: "2026-08-01", ends_on: "2026-09-30" });
    const out = cycle({ id: "o", status: "active", starts_on: "2026-01-01", ends_on: "2026-01-31" });
    const period = { start: "2026-08-17", end: "2026-09-17" };
    expect(filterCycles([starts, ends, span, out], { bucket: "all", today: "2026-08-20", period }).map((c) => c.id)).toEqual([
      "s",
      "e",
      "x",
    ]);
  });

  it("filters buckets without mutating items", () => {
    const items = [spanning, outside];
    const frozen = JSON.stringify(items);
    const active = filterCycles(items, {
      bucket: "active" as CycleBucket,
      today: "2026-08-20",
      period: { start: "2026-08-01", end: "2026-08-31" },
    });
    expect(active.map((c) => c.id)).toEqual(["span"]);
    expect(JSON.stringify(items)).toBe(frozen);
  });
});

describe("next lesson copy", () => {
  it("formats client, day and hour in America/Sao_Paulo", () => {
    const line = formatNextLessonLine(
      "Murilo",
      "2026-08-17T17:00:00-03:00",
      "America/Sao_Paulo",
    );
    expect(line).toBe("Próxima aula: Murilo · 17 ago., 17h");
  });
});
