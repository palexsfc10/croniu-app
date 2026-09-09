import { describe, expect, it } from "vitest";
import {
  addDaysToIsoDate,
  availabilityBackground,
  computeGridBounds,
  isoWeekdayMonday0,
  layoutDayBlocks,
  localDateStr,
  minutesSinceLocalMidnight,
  nowMinutesInGrid,
  startOfWeekMonday,
} from "@/lib/calendar-grid";

const TZ = "America/Sao_Paulo"; // UTC-03:00, no DST as of this codebase's era

describe("minutesSinceLocalMidnight", () => {
  it("converts an ISO instant to org-local minutes", () => {
    expect(minutesSinceLocalMidnight("2026-08-14T12:00:00-03:00", TZ)).toBe(12 * 60);
    expect(minutesSinceLocalMidnight("2026-08-14T09:30:00-03:00", TZ)).toBe(9 * 60 + 30);
  });

  it("normalizes UTC midnight correctly for a UTC-3 org (no 24:00 spillover)", () => {
    // 00:00 UTC-3 == 03:00 UTC
    expect(minutesSinceLocalMidnight("2026-08-14T03:00:00Z", TZ)).toBe(0);
  });
});

describe("isoWeekdayMonday0 / startOfWeekMonday / addDaysToIsoDate", () => {
  it("maps a known Monday and Sunday to 0 and 6", () => {
    // 2026-08-10 is a Monday, 2026-08-16 is a Sunday
    expect(isoWeekdayMonday0("2026-08-10")).toBe(0);
    expect(isoWeekdayMonday0("2026-08-16")).toBe(6);
  });

  it("finds the Monday of the week for any day in it", () => {
    expect(startOfWeekMonday("2026-08-13")).toBe("2026-08-10"); // Thursday -> Monday
    expect(startOfWeekMonday("2026-08-16")).toBe("2026-08-10"); // Sunday -> same week's Monday
    expect(startOfWeekMonday("2026-08-10")).toBe("2026-08-10"); // Monday -> itself
  });

  it("adds/subtracts days across a month boundary", () => {
    expect(addDaysToIsoDate("2026-08-30", 3)).toBe("2026-09-02");
    expect(addDaysToIsoDate("2026-09-02", -3)).toBe("2026-08-30");
  });
});

describe("layoutDayBlocks — never invents overlap, packs exactly what's real", () => {
  const GRID_START = 6 * 60;
  const GRID_END = 21 * 60;

  it("gives a single non-overlapping block the full column", () => {
    const out = layoutDayBlocks(
      [{ id: "a", starts_at: "2026-08-14T09:00:00-03:00", ends_at: "2026-08-14T10:00:00-03:00" }],
      TZ,
      GRID_START,
      GRID_END,
    );
    expect(out).toEqual([
      { id: "a", topMinutes: 9 * 60, heightMinutes: 60, column: 0, columnCount: 1 },
    ]);
  });

  it("splits two overlapping blocks into side-by-side columns", () => {
    const out = layoutDayBlocks(
      [
        { id: "a", starts_at: "2026-08-14T09:00:00-03:00", ends_at: "2026-08-14T10:00:00-03:00" },
        { id: "b", starts_at: "2026-08-14T09:30:00-03:00", ends_at: "2026-08-14T10:30:00-03:00" },
      ],
      TZ,
      GRID_START,
      GRID_END,
    );
    const byId = Object.fromEntries(out.map((b) => [b.id, b]));
    expect(byId.a.column).not.toBe(byId.b.column);
    expect(byId.a.columnCount).toBe(2);
    expect(byId.b.columnCount).toBe(2);
  });

  it("does not treat back-to-back (touching) blocks as overlapping", () => {
    const out = layoutDayBlocks(
      [
        { id: "a", starts_at: "2026-08-14T09:00:00-03:00", ends_at: "2026-08-14T10:00:00-03:00" },
        { id: "b", starts_at: "2026-08-14T10:00:00-03:00", ends_at: "2026-08-14T11:00:00-03:00" },
      ],
      TZ,
      GRID_START,
      GRID_END,
    );
    expect(out.find((b) => b.id === "a")!.columnCount).toBe(1);
    expect(out.find((b) => b.id === "b")!.columnCount).toBe(1);
  });

  it("keeps a later non-overlapping block in its own cluster (full width), unaffected by an earlier overlap", () => {
    const out = layoutDayBlocks(
      [
        { id: "a", starts_at: "2026-08-14T09:00:00-03:00", ends_at: "2026-08-14T10:00:00-03:00" },
        { id: "b", starts_at: "2026-08-14T09:30:00-03:00", ends_at: "2026-08-14T10:30:00-03:00" },
        { id: "c", starts_at: "2026-08-14T14:00:00-03:00", ends_at: "2026-08-14T15:00:00-03:00" },
      ],
      TZ,
      GRID_START,
      GRID_END,
    );
    expect(out.find((b) => b.id === "c")!.columnCount).toBe(1);
  });

  it("enforces a minimum visual height for very short appointments", () => {
    const out = layoutDayBlocks(
      [{ id: "a", starts_at: "2026-08-14T09:00:00-03:00", ends_at: "2026-08-14T09:05:00-03:00" }],
      TZ,
      GRID_START,
      GRID_END,
    );
    expect(out[0].heightMinutes).toBeGreaterThanOrEqual(20);
  });

  it("clamps a block that starts before the grid to the grid's start", () => {
    const out = layoutDayBlocks(
      [{ id: "a", starts_at: "2026-08-14T05:00:00-03:00", ends_at: "2026-08-14T07:00:00-03:00" }],
      TZ,
      GRID_START,
      GRID_END,
    );
    expect(out[0].topMinutes).toBe(GRID_START);
  });
});

describe("availabilityBackground — continuous band, never per-slot boxes", () => {
  const schedule = {
    weekday: 0,
    is_active: true,
    starts_time: "08:00",
    ends_time: "18:00",
    break_starts_time: "12:00",
    break_ends_time: "13:00",
  };

  it("returns nothing for an inactive/unconfigured day", () => {
    expect(availabilityBackground(null, 0, 24 * 60)).toEqual([]);
    expect(availabilityBackground({ ...schedule, is_active: false }, 0, 24 * 60)).toEqual([]);
  });

  it("returns one continuous 'available' band plus one 'break' band", () => {
    const bands = availabilityBackground(schedule, 6 * 60, 21 * 60);
    expect(bands).toEqual([
      { topMinutes: 8 * 60, heightMinutes: 10 * 60, kind: "available" },
      { topMinutes: 12 * 60, heightMinutes: 60, kind: "break" },
    ]);
  });

  it("omits the break band when no break is configured", () => {
    const bands = availabilityBackground(
      { ...schedule, break_starts_time: null, break_ends_time: null },
      6 * 60,
      21 * 60,
    );
    expect(bands).toEqual([{ topMinutes: 8 * 60, heightMinutes: 10 * 60, kind: "available" }]);
  });
});

describe("computeGridBounds — real config/data drives the axis, never a hardcoded Mon-Fri 9-5 assumption", () => {
  it("falls back to a sane default when nothing is configured and there are no appointments", () => {
    expect(computeGridBounds([], [], TZ)).toEqual({ startMinutes: 6 * 60, endMinutes: 21 * 60 });
  });

  it("derives bounds from a real early-morning schedule (e.g. 06:00-14:00), not the fallback", () => {
    const bounds = computeGridBounds(
      [
        {
          weekday: 0,
          is_active: true,
          starts_time: "06:00",
          ends_time: "14:00",
          break_starts_time: null,
          break_ends_time: null,
        },
      ],
      [],
      TZ,
    );
    expect(bounds.startMinutes).toBeLessThanOrEqual(6 * 60);
    expect(bounds.endMinutes).toBeGreaterThanOrEqual(14 * 60);
  });

  it("extends the bounds to include an appointment outside the configured window, never clipping it", () => {
    const bounds = computeGridBounds(
      [
        {
          weekday: 0,
          is_active: true,
          starts_time: "08:00",
          ends_time: "18:00",
          break_starts_time: null,
          break_ends_time: null,
        },
      ],
      [{ id: "late", starts_at: "2026-08-14T20:00:00-03:00", ends_at: "2026-08-14T21:00:00-03:00" }],
      TZ,
    );
    expect(bounds.endMinutes).toBeGreaterThanOrEqual(21 * 60);
  });
});

describe("nowMinutesInGrid", () => {
  it("returns the position when now falls inside the grid window", () => {
    const now = new Date("2026-08-14T12:00:00-03:00");
    expect(nowMinutesInGrid(TZ, 6 * 60, 21 * 60, now)).toBe(12 * 60);
  });

  it("returns null when now falls outside the grid window (line must not render)", () => {
    const now = new Date("2026-08-14T02:00:00-03:00");
    expect(nowMinutesInGrid(TZ, 6 * 60, 21 * 60, now)).toBeNull();
  });
});

describe("localDateStr", () => {
  it("returns the org-local calendar date, not the UTC date", () => {
    // 2026-08-15T01:00:00Z is still 2026-08-14 22:00 in America/Sao_Paulo (UTC-3)
    const now = new Date("2026-08-15T01:00:00Z");
    expect(localDateStr(TZ, now)).toBe("2026-08-14");
  });
});
