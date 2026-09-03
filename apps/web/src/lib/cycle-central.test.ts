import { describe, expect, it } from "vitest";
import {
  buildCycleRow,
  isRenewalEligible,
  matchesCycleView,
  renewalTarget,
  type CycleRow,
} from "@/lib/cycle-central";
import type { Appointment, Cycle, Receivable } from "@/lib/api";

const TODAY = "2026-09-03";

function cycle(over: Partial<Cycle> = {}): Cycle {
  return {
    id: "cy1",
    client_id: "cl1",
    service_id: "sv1",
    cycle_template_id: "tpl1",
    cycle_type: "period",
    status: "active",
    starts_on: "2026-08-01",
    ends_on: "2026-10-01",
    weekdays: [0, 2],
    lesson_count: 8,
    lessons_completed: 3,
    value_cents: 30000,
    default_starts_time: "09:00",
    notes: null,
    last_contacted_at: null,
    contact_confirmed_at: null,
    created_at: "",
    updated_at: "",
    client_name: "Ana",
    service_name: "Aula",
    days_remaining: 28,
    is_nearing_end: false,
    ...over,
  } as Cycle;
}

function receivable(over: Partial<Receivable> = {}): Receivable {
  return {
    id: "r1",
    cycle_id: "cy1",
    client_id: "cl1",
    amount_cents: 30000,
    due_on: "2026-09-01",
    status: "pending",
    paid_at: null,
    payment_method: null,
    notes: null,
    created_at: "",
    updated_at: "",
    ...over,
  } as Receivable;
}

function build(c: Cycle, opts: Partial<Parameters<typeof buildCycleRow>[1]> = {}): CycleRow {
  return buildCycleRow(c, {
    allCycles: opts.allCycles ?? [c],
    receivables: opts.receivables ?? [],
    nextAppointmentByClientId: opts.nextAppointmentByClientId ?? {},
    openRenewalCycleIds: opts.openRenewalCycleIds ?? new Set<string>(),
    today: opts.today ?? TODAY,
  });
}

describe("buildCycleRow — só dados reais, nunca progresso inventado", () => {
  it("exposes progress only when the cycle has a real planned lesson count", () => {
    expect(build(cycle()).progress).toEqual({ done: 3, total: 8 });
    expect(build(cycle({ lesson_count: null })).progress).toBeNull();
  });

  it("sums only open receivables of THIS cycle, never another cycle's", () => {
    const row = build(cycle(), {
      receivables: [
        receivable({ id: "r1", cycle_id: "cy1", amount_cents: 10000 }),
        receivable({ id: "r2", cycle_id: "OTHER", amount_cents: 99999 }),
        receivable({ id: "r3", cycle_id: "cy1", amount_cents: 5000, status: "paid" }),
      ],
    });
    expect(row.pendingCents).toBe(10000);
  });

  it("flags a financial alert only for a receivable actually past due", () => {
    const notYet = build(cycle(), { receivables: [receivable({ due_on: "2026-12-01" })] });
    expect(notYet.alerts).not.toContain("financial");
    const overdue = build(cycle(), { receivables: [receivable({ due_on: "2026-08-01" })] });
    expect(overdue.alerts).toContain("financial");
    expect(overdue.overdueCount).toBe(1);
  });

  it("flags renewal when the cycle is nearing its end and nothing succeeds it", () => {
    const row = build(cycle({ is_nearing_end: true }));
    expect(row.alerts).toContain("renewal");
    expect(row.hasSuccessor).toBe(false);
  });

  it("never nags about renewal once a successor cycle already exists", () => {
    const current = cycle({ id: "cy1", is_nearing_end: true, ends_on: "2026-10-01" });
    const successor = cycle({ id: "cy2", starts_on: "2026-10-01", ends_on: "2026-12-01" });
    const row = build(current, { allCycles: [current, successor] });
    expect(row.hasSuccessor).toBe(true);
    expect(row.alerts).not.toContain("renewal");
  });

  it("flags no_schedule only for a running cycle with neither weekdays nor a time", () => {
    const row = build(cycle({ weekdays: null, default_starts_time: null }));
    expect(row.alerts).toContain("no_schedule");
    const upcoming = build(
      cycle({ weekdays: null, default_starts_time: null, starts_on: "2026-12-01", ends_on: "2027-02-01" }),
    );
    expect(upcoming.alerts).not.toContain("no_schedule");
  });

  it("raises no alert at all for a cancelled cycle", () => {
    const row = build(
      cycle({ status: "cancelled", is_nearing_end: true, weekdays: null, default_starts_time: null }),
      { receivables: [receivable({ due_on: "2026-08-01" })] },
    );
    expect(row.alerts).toEqual([]);
  });

  it("attributes a next session only to the cycle that is actually running now", () => {
    const appt = { id: "a1", client_id: "cl1", starts_at: "2026-09-05T12:00:00Z" } as Appointment;
    const running = build(cycle(), { nextAppointmentByClientId: { cl1: appt } });
    expect(running.nextAppointment).toBe(appt);
    const ended = build(cycle({ ends_on: "2026-08-01", status: "ended" }), {
      nextAppointmentByClientId: { cl1: appt },
    });
    expect(ended.nextAppointment).toBeNull();
  });
});

describe("matchesCycleView", () => {
  it("separates renewing from merely active", () => {
    const nearing = build(cycle({ is_nearing_end: true }));
    const plain = build(cycle());
    expect(matchesCycleView(nearing, "renewing", TODAY)).toBe(true);
    expect(matchesCycleView(plain, "renewing", TODAY)).toBe(false);
    expect(matchesCycleView(plain, "active", TODAY)).toBe(true);
  });

  it("'attention' is any real alert, not a separate invented state", () => {
    const clean = build(cycle());
    expect(matchesCycleView(clean, "attention", TODAY)).toBe(false);
    const alerted = build(cycle(), { receivables: [receivable({ due_on: "2026-08-01" })] });
    expect(matchesCycleView(alerted, "attention", TODAY)).toBe(true);
  });
});

describe("renewalTarget — sempre o fluxo existente, nunca uma mutação", () => {
  it("returns null for a cycle that is not actually renewable", () => {
    expect(renewalTarget(build(cycle()), "/app/cycles")).toBeNull();
    expect(isRenewalEligible(build(cycle()))).toBe(false);
  });

  it("sends the professional to the real request queue when the client already asked", () => {
    const row = build(cycle({ is_nearing_end: true }), {
      openRenewalCycleIds: new Set(["cy1"]),
    });
    expect(renewalTarget(row, "/app/cycles")).toBe("/app/renewals");
  });

  it("pre-fills the existing cycle form from the source cycle, carrying returnTo", () => {
    const row = build(cycle({ is_nearing_end: true }));
    const href = renewalTarget(row, "/app/cycles");
    expect(href).toContain("/app/cycles/new?");
    expect(href).toContain("clientId=cl1");
    expect(href).toContain("serviceId=sv1");
    expect(href).toContain("templateId=tpl1");
    expect(href).toContain("weekdays=0%2C2");
    expect(href).toContain("returnTo=%2Fapp%2Fcycles");
  });

  it("never carries a hardcoded duration — the template alone decides it", () => {
    const row = build(cycle({ is_nearing_end: true }));
    const href = renewalTarget(row, "/app/cycles") ?? "";
    expect(href).not.toMatch(/month|mes|duration/i);
  });

  it("offers renewal for an ended cycle with no successor", () => {
    const ended = cycle({ status: "ended", ends_on: "2026-08-01" });
    const row = build(ended);
    expect(isRenewalEligible(row)).toBe(true);
  });
});
