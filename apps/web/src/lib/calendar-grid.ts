/**
 * Pure layout math for the Agenda desktop calendar (Day + Week views).
 * No DOM, no React — every function here takes real appointment/availability
 * data and returns minute-based positions; the component multiplies by a
 * px-per-minute constant. Kept pure so overlap-packing and background-band
 * math can be unit tested without rendering anything.
 */

export type CalendarBlockInput = {
  id: string;
  starts_at: string; // ISO, any offset
  ends_at: string;
};

export type LaidOutBlock = {
  id: string;
  topMinutes: number;
  heightMinutes: number;
  column: number;
  columnCount: number;
};

export type DayScheduleLike = {
  weekday: number;
  is_active: boolean;
  starts_time: string;
  ends_time: string;
  break_starts_time: string | null;
  break_ends_time: string | null;
};

export type AvailabilityBand = {
  topMinutes: number;
  heightMinutes: number;
  kind: "available" | "break";
};

const MIN_BLOCK_MINUTES = 20;

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(Math.max(value, lo), hi);
}

/** Minutes since local midnight, in the given IANA timezone. */
export function minutesSinceLocalMidnight(iso: string, timeZone: string): number {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return (hour % 24) * 60 + minute;
}

/** Monday=0..Sunday=6 for a `YYYY-MM-DD` local date, matching the backend's
 * AvailabilitySchedule.weekday convention (never derive this from a JS Date
 * constructed without an explicit UTC anchor — timezone shifts would give
 * the wrong day). */
export function isoWeekdayMonday0(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const jsDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun..6=Sat
  return (jsDay + 6) % 7;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** Greedy interval-graph column packing: overlapping blocks split into side-
 * by-side columns; non-overlapping blocks (different clusters) each get the
 * full width. Deterministic ordering by (start, then id) so re-renders with
 * the same data never visually shuffle columns. */
export function layoutDayBlocks(
  blocks: CalendarBlockInput[],
  timeZone: string,
  gridStartMinutes: number,
  gridEndMinutes: number,
): LaidOutBlock[] {
  type Prepared = CalendarBlockInput & { top: number; height: number };

  const prepared: Prepared[] = blocks
    .map((b) => {
      const rawTop = minutesSinceLocalMidnight(b.starts_at, timeZone);
      const rawEnd = minutesSinceLocalMidnight(b.ends_at, timeZone);
      const top = clamp(rawTop, gridStartMinutes, gridEndMinutes);
      // An end time that's numerically <= start (crossed local midnight, or
      // an edge case at the grid boundary) is clamped to the grid's end
      // rather than wrapping — this is a display grid, not a data model.
      const rawBottom = rawEnd <= rawTop ? gridEndMinutes : rawEnd;
      const bottom = clamp(rawBottom, gridStartMinutes, gridEndMinutes);
      return { ...b, top, height: Math.max(bottom - top, MIN_BLOCK_MINUTES) };
    })
    .sort((a, b) => a.top - b.top || a.id.localeCompare(b.id));

  const clusters: Prepared[][] = [];
  let current: Prepared[] = [];
  let currentEnd = -Infinity;
  for (const b of prepared) {
    if (current.length === 0 || b.top < currentEnd) {
      current.push(b);
      currentEnd = Math.max(currentEnd, b.top + b.height);
    } else {
      clusters.push(current);
      current = [b];
      currentEnd = b.top + b.height;
    }
  }
  if (current.length) clusters.push(current);

  const result: LaidOutBlock[] = [];
  for (const cluster of clusters) {
    const columnEnds: number[] = [];
    const assigned: Array<Prepared & { column: number }> = [];
    for (const b of cluster) {
      let col = columnEnds.findIndex((end) => end <= b.top);
      if (col === -1) {
        col = columnEnds.length;
        columnEnds.push(b.top + b.height);
      } else {
        columnEnds[col] = b.top + b.height;
      }
      assigned.push({ ...b, column: col });
    }
    const columnCount = columnEnds.length;
    for (const a of assigned) {
      result.push({
        id: a.id,
        topMinutes: a.top,
        heightMinutes: a.height,
        column: a.column,
        columnCount,
      });
    }
  }
  return result;
}

/** Continuous background bands for a day column — the "working hours" band
 * plus an optional break band — never per-slot boxes. `null`/inactive means
 * the whole day is outside the configured journey (nothing to shade). */
export function availabilityBackground(
  daySchedule: DayScheduleLike | null,
  gridStartMinutes: number,
  gridEndMinutes: number,
): AvailabilityBand[] {
  if (!daySchedule || !daySchedule.is_active) return [];
  const start = clamp(timeToMinutes(daySchedule.starts_time), gridStartMinutes, gridEndMinutes);
  const end = clamp(timeToMinutes(daySchedule.ends_time), gridStartMinutes, gridEndMinutes);
  if (end <= start) return [];
  const bands: AvailabilityBand[] = [
    { topMinutes: start, heightMinutes: end - start, kind: "available" },
  ];
  if (daySchedule.break_starts_time && daySchedule.break_ends_time) {
    const bStart = clamp(timeToMinutes(daySchedule.break_starts_time), start, end);
    const bEnd = clamp(timeToMinutes(daySchedule.break_ends_time), start, end);
    if (bEnd > bStart) {
      bands.push({ topMinutes: bStart, heightMinutes: bEnd - bStart, kind: "break" });
    }
  }
  return bands;
}

/** Vertical grid bounds (in minutes) that fit every configured working day
 * and every appointment actually being shown — so a professional who works
 * 06:00-14:00 never gets a grid padded out to a hardcoded 08:00-20:00, and
 * an outlier late-evening appointment is never clipped off the grid. */
export function computeGridBounds(
  daySchedules: DayScheduleLike[],
  blocks: CalendarBlockInput[],
  timeZone: string,
  fallback: { startMinutes: number; endMinutes: number } = { startMinutes: 6 * 60, endMinutes: 21 * 60 },
): { startMinutes: number; endMinutes: number } {
  let start = Infinity;
  let end = -Infinity;
  for (const d of daySchedules) {
    if (!d.is_active) continue;
    start = Math.min(start, timeToMinutes(d.starts_time));
    end = Math.max(end, timeToMinutes(d.ends_time));
  }
  for (const b of blocks) {
    const top = minutesSinceLocalMidnight(b.starts_at, timeZone);
    const rawBottom = minutesSinceLocalMidnight(b.ends_at, timeZone);
    const bottom = rawBottom <= top ? top + MIN_BLOCK_MINUTES : rawBottom;
    start = Math.min(start, top);
    end = Math.max(end, bottom);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return fallback;
  }
  // Small padding so the first/last block isn't flush against the grid edge.
  return {
    startMinutes: Math.max(0, Math.floor(start / 30) * 30 - 30),
    endMinutes: Math.min(24 * 60, Math.ceil(end / 30) * 30 + 30),
  };
}

/** Position (in minutes) of "now" within the grid, or null when now falls
 * outside the visible window — the current-time line should not render. */
export function nowMinutesInGrid(
  timeZone: string,
  gridStartMinutes: number,
  gridEndMinutes: number,
  now: Date = new Date(),
): number | null {
  const minutes = minutesSinceLocalMidnight(now.toISOString(), timeZone);
  if (minutes < gridStartMinutes || minutes > gridEndMinutes) return null;
  return minutes;
}

/** The local `YYYY-MM-DD` for `now` in the given timezone — used to know
 * which column of a week grid gets the current-time line / "today" marker. */
export function localDateStr(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

export function addDaysToIsoDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Monday of the week containing `dateStr` (Monday-first weeks, matching
 * AvailabilitySchedule's weekday convention). */
export function startOfWeekMonday(dateStr: string): string {
  return addDaysToIsoDate(dateStr, -isoWeekdayMonday0(dateStr));
}
