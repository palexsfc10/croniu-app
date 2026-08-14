import { describe, expect, it } from "vitest";
import type { Cycle } from "@/lib/api";
import { cycleBucket, filterCycles, selectDisplayCycle } from "@/lib/cycle-period";

function cycle(partial: Partial<Cycle> & Pick<Cycle, "id" | "starts_on" | "ends_on" | "status">): Cycle {
  return {
    client_id: "c1",
    service_id: "s1",
    cycle_type: "period",
    value_cents: 0,
    notes: null,
    last_contacted_at: null,
    contact_confirmed_at: null,
    created_at: "",
    updated_at: "",
    client_name: "A",
    service_name: "Aula",
    days_remaining: 10,
    is_nearing_end: false,
    ...partial,
  };
}

describe("selectDisplayCycle", () => {
  it("prefers an in-window active cycle over a future one", () => {
    const current = cycle({
      id: "now",
      status: "active",
      starts_on: "2026-08-01",
      ends_on: "2026-09-01",
    });
    const upcoming = cycle({
      id: "later",
      status: "active",
      starts_on: "2026-09-10",
      ends_on: "2026-10-10",
    });
    expect(selectDisplayCycle([upcoming, current], "2026-08-14")?.id).toBe("now");
  });

  it("shows upcoming as the display cycle when nothing has started", () => {
    const upcoming = cycle({
      id: "later",
      status: "active",
      starts_on: "2026-08-17",
      ends_on: "2026-09-17",
    });
    expect(selectDisplayCycle([upcoming], "2026-08-13")?.id).toBe("later");
  });

  it("ignores cancelled leftovers", () => {
    const cancelled = cycle({
      id: "old",
      status: "cancelled",
      starts_on: "2026-08-01",
      ends_on: "2026-09-01",
    });
    expect(selectDisplayCycle([cancelled], "2026-08-13")).toBeNull();
  });
});

describe("filterCycles active bucket", () => {
  it("keeps upcoming cycles on the Próximos tab, not Em andamento", () => {
    const upcoming = cycle({
      id: "later",
      status: "active",
      starts_on: "2026-08-17",
      ends_on: "2026-09-17",
    });
    expect(cycleBucket(upcoming, "2026-08-13")).toBe("upcoming");
    const upcomingTab = filterCycles([upcoming], {
      bucket: "upcoming",
      today: "2026-08-13",
      period: { start: "2026-08-01", end: "2026-08-31" },
    });
    expect(upcomingTab.map((c) => c.id)).toEqual(["later"]);
    const visible = filterCycles([upcoming], {
      bucket: "active",
      today: "2026-08-13",
      period: { start: "2026-08-01", end: "2026-08-31" },
    });
    expect(visible.map((c) => c.id)).toEqual([]);
  });
});
