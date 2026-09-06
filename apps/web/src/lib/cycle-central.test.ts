import { describe, expect, it } from "vitest";
import {
  buildCycleRow,
  isRenewalEligible,
  matchesCycleView,
  renewalTarget,
  type CycleRow,
} from "@/lib/cycle-central";
import { buildRenewalCaseIndex } from "@/lib/renewal-status";
import type { Appointment, Cycle, Receivable, RenewalCaseView } from "@/lib/api";

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

function renewalCase(over: Partial<RenewalCaseView> = {}): RenewalCaseView {
  return {
    case_id: "case1",
    client_id: "cl1",
    client_name: "Ana",
    source_cycle_id: "cy1",
    service_name: "Aula",
    ends_on: "2026-10-01",
    display_status: "upcoming",
    portal_requested: false,
    next_contact_date: null,
    resolution_reason: null,
    resolution_note: null,
    resolved_at: null,
    successor_cycle_id: null,
    ...over,
  } as RenewalCaseView;
}

function build(c: Cycle, opts: { receivables?: Receivable[]; nextAppointmentByClientId?: Record<string, Appointment>; renewalCases?: RenewalCaseView[]; today?: string } = {}): CycleRow {
  return buildCycleRow(c, {
    receivables: opts.receivables ?? [],
    nextAppointmentByClientId: opts.nextAppointmentByClientId ?? {},
    renewalCases: buildRenewalCaseIndex(opts.renewalCases ?? []),
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

  it("flags renewal only when RenewalCase says the cycle still needs a decision — never a client+service+date guess", () => {
    const row = build(cycle({ is_nearing_end: true }), {
      renewalCases: [renewalCase({ display_status: "pending" })],
    });
    expect(row.alerts).toContain("renewal");
    expect(row.renewalCase?.display_status).toBe("pending");
  });

  it("never flags renewal for a merely 'upcoming' (>7 days out) case — informational only, never a decision", () => {
    const row = build(cycle({ is_nearing_end: true }), {
      renewalCases: [renewalCase({ display_status: "upcoming" })],
    });
    expect(row.alerts).not.toContain("renewal");
  });

  it("never flags renewal for a cycle with no RenewalCase at all", () => {
    const row = build(cycle({ is_nearing_end: true }));
    expect(row.alerts).not.toContain("renewal");
    expect(row.renewalCase).toBeNull();
  });

  it("never nags about renewal once the case is resolved — renewed or ended without renewal, regardless of successor cycles existing", () => {
    const renewed = build(cycle({ is_nearing_end: true }), {
      renewalCases: [renewalCase({ display_status: "renewed", successor_cycle_id: "cy2" })],
    });
    expect(renewed.alerts).not.toContain("renewal");

    const endedWithoutRenewal = build(cycle({ status: "ended", ends_on: "2026-08-01" }), {
      renewalCases: [renewalCase({ display_status: "ended_without_renewal" })],
    });
    expect(endedWithoutRenewal.alerts).not.toContain("renewal");
  });

  it("flags no_schedule only for a running cycle with neither weekdays nor a time", () => {
    const row = build(cycle({ weekdays: null, default_starts_time: null }));
    expect(row.alerts).toContain("no_schedule");
    const upcoming = build(
      cycle({ weekdays: null, default_starts_time: null, starts_on: "2026-12-01", ends_on: "2027-02-01" }),
    );
    expect(upcoming.alerts).not.toContain("no_schedule");
  });

  it("raises no alert at all for a cancelled cycle, even with an open renewal case", () => {
    const row = build(
      cycle({ status: "cancelled", is_nearing_end: true, weekdays: null, default_starts_time: null }),
      {
        receivables: [receivable({ due_on: "2026-08-01" })],
        renewalCases: [renewalCase({ display_status: "overdue" })],
      },
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

  it("sends the professional to the real request queue when the RenewalCase says the client already asked through the portal", () => {
    const row = build(cycle({ is_nearing_end: true }), {
      renewalCases: [renewalCase({ display_status: "pending", portal_requested: true })],
    });
    expect(renewalTarget(row, "/app/cycles")).toBe("/app/renewals");
  });

  it("pre-fills the existing cycle form from the source cycle, carrying returnTo", () => {
    const row = build(cycle({ is_nearing_end: true }), {
      renewalCases: [renewalCase({ display_status: "pending" })],
    });
    const href = renewalTarget(row, "/app/cycles");
    expect(href).toContain("/app/cycles/new?");
    expect(href).toContain("clientId=cl1");
    expect(href).toContain("serviceId=sv1");
    expect(href).toContain("templateId=tpl1");
    expect(href).toContain("weekdays=0%2C2");
    expect(href).toContain("returnTo=%2Fapp%2Fcycles");
  });

  it("never carries a hardcoded duration — the template alone decides it", () => {
    const row = build(cycle({ is_nearing_end: true }), {
      renewalCases: [renewalCase({ display_status: "pending" })],
    });
    const href = renewalTarget(row, "/app/cycles") ?? "";
    expect(href).not.toMatch(/month|mes|duration/i);
  });

  it("offers renewal for an ended cycle whose case is still overdue", () => {
    const ended = cycle({ status: "ended", ends_on: "2026-08-01" });
    const row = build(ended, { renewalCases: [renewalCase({ display_status: "overdue" })] });
    expect(isRenewalEligible(row)).toBe(true);
  });
});
