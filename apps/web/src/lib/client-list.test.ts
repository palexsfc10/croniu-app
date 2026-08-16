import { describe, expect, it } from "vitest";
import { clientInitials, clientListPresentation } from "@/lib/client-list";
import type { Client, Cycle } from "@/lib/api";

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
