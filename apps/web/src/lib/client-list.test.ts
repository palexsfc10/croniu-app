import { describe, expect, it } from "vitest";
import {
  buildClientRow,
  clientInitials,
  clientListPresentation,
  matchesView,
  mobileAttentionDetail,
  primaryAttentionReason,
} from "@/lib/client-list";
import type { Appointment, Client, Cycle, Receivable } from "@/lib/api";

const client: Client = {
  id: "c1",
  full_name: "Pedro Xavier",
  phone: "11987654321",
  email: null,
  notes: null,
  status: "active",
  created_at: "",
  updated_at: "",
};

const terms = { session: "aula", accompaniment: "acompanhamento" };

describe("client list presentation", () => {
  it("uses initials from first and last name", () => {
    expect(clientInitials("Pedro Xavier")).toBe("PX");
    expect(clientInitials("Maria")).toBe("MA");
  });

  it("does not use raw phone as the only subtitle when there is no cycle", () => {
    const row = clientListPresentation(client, [], "2026-08-14", terms);
    expect(row.subtitle.toLowerCase()).toContain("acompanhamento");
    expect(row.subtitle).not.toBe("11987654321");
    expect(row.badge.label).toBe("Sem ciclo");
  });

  it("flags a cycle that is nearing the end", () => {
    const cycle = {
      id: "cy1",
      client_id: "c1",
      service_id: "s1",
      cycle_type: "intelligent",
      status: "active",
      starts_on: "2026-08-01",
      ends_on: "2026-08-20",
      value_cents: 1000,
      notes: null,
      last_contacted_at: null,
      contact_confirmed_at: null,
      created_at: "",
      updated_at: "",
      client_name: "Pedro Xavier",
      service_name: "Aula",
      days_remaining: 6,
      is_nearing_end: true,
    } as Cycle;
    const row = clientListPresentation(client, [cycle], "2026-08-14", terms);
    expect(row.subtitle).toContain("Ciclo termina");
    expect(row.badge.label).toBe("Precisa de atenção");
  });
});

function baseCycle(overrides: Partial<Cycle> = {}): Cycle {
  return {
    id: "cy1",
    client_id: "c1",
    service_id: "s1",
    cycle_type: "intelligent",
    status: "active",
    starts_on: "2026-08-01",
    ends_on: "2026-08-20",
    value_cents: 1000,
    notes: null,
    last_contacted_at: null,
    contact_confirmed_at: null,
    created_at: "",
    updated_at: "",
    client_name: "Pedro Xavier",
    service_name: "Aula",
    days_remaining: 6,
    is_nearing_end: false,
    ...overrides,
  } as Cycle;
}

function baseReceivable(overrides: Partial<Receivable> = {}): Receivable {
  return {
    id: "r1",
    cycle_id: "cy1",
    client_id: "c1",
    amount_cents: 15000,
    due_on: "2026-08-01",
    status: "pending",
    paid_at: null,
    payment_method: null,
    notes: null,
    created_at: "",
    updated_at: "",
    client_name: "Pedro Xavier",
    cycle_service_name: "Aula",
    ...overrides,
  };
}

describe("buildClientRow — real, derived attention reasons (never invented)", () => {
  const today = "2026-08-14";
  const baseOpts = {
    cycles: [] as Cycle[],
    receivables: [] as Receivable[],
    nextAppointmentByClientId: {} as Record<string, Appointment>,
    pendingIntakeClientIds: new Set<string>(),
    today,
  };

  it("flags 'onboarding' for a client that has never had a cycle", () => {
    const row = buildClientRow(client, baseOpts);
    expect(row.reasons).toContain("onboarding");
    expect(row.activeCycle).toBeNull();
  });

  it("flags 'onboarding' for a client with a pending intake submission awaiting review", () => {
    const row = buildClientRow(client, {
      ...baseOpts,
      pendingIntakeClientIds: new Set(["c1"]),
    });
    expect(row.reasons).toContain("onboarding");
  });

  it("flags 'renewal' when the active cycle is nearing its end with no upcoming replacement", () => {
    const cycle = baseCycle({ is_nearing_end: true, days_remaining: 3 });
    const row = buildClientRow(client, { ...baseOpts, cycles: [cycle] });
    expect(row.reasons).toContain("renewal");
    expect(row.reasons).not.toContain("onboarding");
  });

  it("does not flag 'renewal' when an upcoming cycle already covers the renewal", () => {
    const active = baseCycle({ is_nearing_end: true, days_remaining: 3 });
    const upcoming = baseCycle({ id: "cy2", starts_on: "2026-08-21", ends_on: "2026-09-21" });
    const row = buildClientRow(client, { ...baseOpts, cycles: [active, upcoming] });
    expect(row.reasons).not.toContain("renewal");
  });

  it("flags 'financial' only for an overdue pending receivable, not a merely-pending future one", () => {
    const cycle = baseCycle();
    const overdue = baseReceivable({ due_on: "2026-08-01" }); // before today
    const rowOverdue = buildClientRow(client, {
      ...baseOpts,
      cycles: [cycle],
      receivables: [overdue],
    });
    expect(rowOverdue.reasons).toContain("financial");
    expect(rowOverdue.overdueReceivablesCount).toBe(1);

    const future = baseReceivable({ due_on: "2026-08-20" }); // after today
    const rowFuture = buildClientRow(client, {
      ...baseOpts,
      cycles: [cycle],
      receivables: [future],
    });
    expect(rowFuture.reasons).not.toContain("financial");
    expect(rowFuture.pendingReceivablesCount).toBe(1);
  });

  it("never counts a paid receivable as pending or overdue", () => {
    const cycle = baseCycle();
    const paid = baseReceivable({ status: "paid", due_on: "2026-08-01" });
    const row = buildClientRow(client, { ...baseOpts, cycles: [cycle], receivables: [paid] });
    expect(row.pendingReceivablesCount).toBe(0);
    expect(row.overdueReceivablesCount).toBe(0);
    expect(row.reasons).not.toContain("financial");
  });

  it("flags 'no_accompaniment' for a client who once had a cycle but has none now, with no pending intake", () => {
    const ended = baseCycle({ status: "ended", starts_on: "2026-06-01", ends_on: "2026-06-30" });
    const row = buildClientRow(client, { ...baseOpts, cycles: [ended] });
    expect(row.reasons).toContain("no_accompaniment");
    expect(row.reasons).not.toContain("onboarding");
  });

  it("never flags an archived client — attention reasons only apply to active clients", () => {
    const archived: Client = { ...client, status: "archived" };
    const row = buildClientRow(archived, baseOpts);
    expect(row.reasons).toEqual([]);
  });

  it("carries the real next appointment through untouched", () => {
    const appt: Appointment = {
      id: "a1",
      client_id: "c1",
      cycle_id: null,
      service_id: null,
      location_id: null,
      title: null,
      starts_at: "2026-08-15T14:00:00Z",
      ends_at: "2026-08-15T15:00:00Z",
      status: "scheduled",
      notes: null,
      created_at: "",
      updated_at: "",
      client_name: "Pedro Xavier",
      service_name: "Aula",
      location_name: null,
      cycle_service_name: null,
    };
    const row = buildClientRow(client, {
      ...baseOpts,
      nextAppointmentByClientId: { c1: appt },
    });
    expect(row.nextAppointment).toBe(appt);
  });
});

describe("matchesView", () => {
  const today = "2026-08-14";
  const row = buildClientRow(client, {
    cycles: [],
    receivables: [],
    nextAppointmentByClientId: {},
    pendingIntakeClientIds: new Set<string>(),
    today,
  });

  it("'all' matches every row regardless of reasons", () => {
    expect(matchesView(row, "all")).toBe(true);
  });

  it("'attention' matches any row with at least one reason", () => {
    expect(row.reasons.length).toBeGreaterThan(0);
    expect(matchesView(row, "attention")).toBe(true);
  });

  it("a specific view only matches rows carrying that exact reason", () => {
    expect(matchesView(row, "onboarding")).toBe(true);
    expect(matchesView(row, "financial")).toBe(false);
  });
});

describe("primaryAttentionReason / mobileAttentionDetail — mobile shows one headline, never the whole badge row", () => {
  const today = "2026-08-14";
  const baseOpts = {
    cycles: [] as Cycle[],
    receivables: [] as Receivable[],
    nextAppointmentByClientId: {} as Record<string, Appointment>,
    pendingIntakeClientIds: new Set<string>(),
    today,
  };

  it("returns null with no detail when the client has no attention reasons", () => {
    const cycle = baseCycle();
    const row = buildClientRow(client, { ...baseOpts, cycles: [cycle] });
    expect(primaryAttentionReason(row)).toBeNull();
    expect(mobileAttentionDetail(row)).toBeNull();
  });

  it("picks 'financial' over 'onboarding' when both apply, and includes 'atrasado' — never a bare badge", () => {
    const overdue = baseReceivable({ due_on: "2026-08-01" });
    const row = buildClientRow(client, { ...baseOpts, receivables: [overdue] });
    expect(row.reasons).toContain("financial");
    expect(row.reasons).toContain("onboarding");
    expect(primaryAttentionReason(row)).toBe("financial");
    expect(mobileAttentionDetail(row)).toContain("atrasado");
  });

  it("shows the real days-remaining count for 'renewal', never a generic label alone", () => {
    const cycle = baseCycle({ is_nearing_end: true, days_remaining: 4 });
    const row = buildClientRow(client, { ...baseOpts, cycles: [cycle] });
    expect(primaryAttentionReason(row)).toBe("renewal");
    expect(mobileAttentionDetail(row)).toBe("Renovação em 4 dias");
  });

  it("falls back to the plain reason label when there is no numeric detail to show (e.g. onboarding)", () => {
    const row = buildClientRow(client, baseOpts);
    expect(primaryAttentionReason(row)).toBe("onboarding");
    expect(mobileAttentionDetail(row)).toBe("Onboarding");
  });
});
