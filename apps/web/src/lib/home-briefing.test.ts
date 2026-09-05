import { describe, expect, it } from "vitest";
import { buildBriefing, isNewProfessional } from "@/lib/home-briefing";
import type { HomeSummary } from "@/lib/api";

function baseSummary(overrides: Partial<HomeSummary> = {}): HomeSummary {
  return {
    organization_id: "org-1",
    timezone: "America/Sao_Paulo",
    local_today: "2026-09-03",
    today_appointments: [],
    upcoming_appointments: [],
    cycles_nearing_end: [],
    renewals: [],
    pending_payments: [],
    attention_items: [],
    priority_action: null,
    contextual_hint: null,
    message: "",
    has_active_service: true,
    has_active_cycle_template: true,
    ...overrides,
  };
}

describe("buildBriefing", () => {
  it("picks the next appointment from upcoming_appointments, never inventing a fallback", () => {
    const summary = baseSummary({
      upcoming_appointments: [
        {
          id: "a1",
          client_id: "c1",
          cycle_id: null,
          service_id: null,
          location_id: null,
          title: null,
          starts_at: "2026-09-03T14:00:00Z",
          ends_at: "2026-09-03T15:00:00Z",
          status: "scheduled",
          notes: null,
          created_at: "",
          updated_at: "",
          client_name: "Ana",
          service_name: "Personal",
          location_name: null,
          cycle_service_name: null,
        },
      ],
    });
    const briefing = buildBriefing(summary);
    expect(briefing.nextAppointment).toEqual({
      id: "a1",
      clientName: "Ana",
      startsAt: "2026-09-03T14:00:00Z",
      serviceLabel: "Personal",
    });
  });

  it("reuses priority_action as the main risk without re-ranking", () => {
    const summary = baseSummary({
      priority_action: {
        kind: "pending_payment",
        title: "Cobrança vencida",
        subtitle: "Ana Silva",
        href: "/app/receivables/r1",
        entity_id: "r1",
      },
      attention_items: [
        { kind: "pending_payment", title: "Cobrança vencida", subtitle: "Ana Silva", href: "/app/receivables/r1", entity_id: "r1", tone: "danger" },
      ],
    });
    const briefing = buildBriefing(summary);
    expect(briefing.mainRisk?.entity_id).toBe("r1");
    expect(briefing.urgentCount).toBe(1);
  });

  it("opportunity is the first attention item distinct from the main risk", () => {
    const summary = baseSummary({
      priority_action: {
        kind: "pending_payment",
        title: "Cobrança vencida",
        subtitle: "Ana",
        href: "/app/receivables/r1",
        entity_id: "r1",
      },
      attention_items: [
        { kind: "pending_payment", title: "Cobrança vencida", subtitle: "Ana", href: "/app/receivables/r1", entity_id: "r1", tone: "danger" },
        { kind: "renewal_requested", title: "Renovação solicitada", subtitle: "Bruno", href: "/app/renewals", entity_id: "rr1", tone: "info" },
      ],
    });
    const briefing = buildBriefing(summary);
    expect(briefing.opportunity).toEqual({
      title: "Renovação solicitada",
      subtitle: "Bruno",
      href: "/app/renewals",
    });
  });

  it("counts accompaniment (evaluation) pendencies into urgentCount when provided", () => {
    const summary = baseSummary();
    const briefing = buildBriefing(summary, { accompanimentPendingCount: 3 });
    expect(briefing.urgentCount).toBe(3);
  });

  it("accompaniment/routine extraItems feed the same opportunity search urgentCount draws from — never 'N itens urgentes' next to 'dia livre'", () => {
    const summary = baseSummary(); // no backend attention_items, no priority_action
    const briefing = buildBriefing(summary, {
      extraItems: [
        {
          kind: "evaluation_pending",
          title: "Avaliação pendente · Murilo Macedo",
          subtitle: "21 dias sem registro",
          href: "/app/clients/c1?tab=prontuario",
          entity_id: "c1",
          tone: "warning",
        },
      ],
    });
    expect(briefing.urgentCount).toBe(1);
    // The old bug: urgentCount saw this item but opportunity/mainRisk
    // never did, so isClearDay stayed true and both messages rendered.
    expect(briefing.isClearDay).toBe(false);
    expect(briefing.opportunity).toEqual({
      title: "Avaliação pendente · Murilo Macedo",
      subtitle: "21 dias sem registro",
      href: "/app/clients/c1?tab=prontuario",
    });
  });

  it("a genuinely empty summary reads as a clear day, never a fabricated risk", () => {
    const briefing = buildBriefing(baseSummary());
    expect(briefing.isClearDay).toBe(true);
    expect(briefing.mainRisk).toBeNull();
    expect(briefing.opportunity).toBeNull();
  });
});

describe("isNewProfessional", () => {
  it("true only when every real signal is empty", () => {
    expect(
      isNewProfessional(
        baseSummary({ has_active_service: false, has_active_cycle_template: false }),
      ),
    ).toBe(true);
  });

  it("false when only routines_due_today_count is non-zero — an active pro with a routine pendency is never mistaken for a first-time account", () => {
    expect(
      isNewProfessional(
        baseSummary({
          has_active_service: false,
          has_active_cycle_template: false,
          routines_due_today_count: 5,
        }),
      ),
    ).toBe(false);
  });

  it("false as soon as one real signal exists", () => {
    expect(
      isNewProfessional(
        baseSummary({
          has_active_service: false,
          has_active_cycle_template: false,
          pending_payments: [
            {
              id: "r1",
              cycle_id: "c1",
              client_id: "cl1",
              amount_cents: 1000,
              due_on: "2026-09-01",
              status: "pending",
              paid_at: null,
              payment_method: null,
              notes: null,
              created_at: "",
              updated_at: "",
              client_name: "Ana",
              cycle_service_name: "Aula",
            },
          ],
        }),
      ),
    ).toBe(false);
  });
});
