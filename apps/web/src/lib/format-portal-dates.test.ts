import { describe, expect, it } from "vitest";
import { formatPortalDate, formatPortalDateTime } from "@/lib/format-portal-dates";

describe("formatPortalDate", () => {
  it("formats dd/mm/aaaa in local time", () => {
    const iso = "2026-08-17T15:04:00.000Z";
    const date = new Date(iso);
    const expected = `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/2026`;
    expect(formatPortalDate(iso)).toBe(expected);
  });

  it("formats last access with time", () => {
    const iso = "2026-08-17T15:04:00.000Z";
    const formatted = formatPortalDateTime(iso);
    expect(formatted).toMatch(/^\d{2}\/\d{2}\/2026 às \d{2}:\d{2}$/);
  });

  it("returns null for missing values", () => {
    expect(formatPortalDate(null)).toBeNull();
    expect(formatPortalDateTime(undefined)).toBeNull();
  });
});
