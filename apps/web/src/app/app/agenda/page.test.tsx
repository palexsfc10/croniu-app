import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Appointment, DayAgenda, OrgPreferences } from "@/lib/api";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}));

const PREFS: OrgPreferences = {
  id: "org1",
  name: "Studio",
  timezone: "America/Sao_Paulo",
  local_today: "2026-08-22",
};

const APPOINTMENT: Appointment = {
  id: "appt-1",
  client_id: "c1",
  cycle_id: null,
  service_id: null,
  location_id: null,
  title: null,
  starts_at: "2026-08-22T12:00:00Z",
  ends_at: "2026-08-22T13:00:00Z",
  status: "no_show",
  notes: null,
  created_at: "",
  updated_at: "",
  client_name: "Aluna Teste",
  service_name: "Personal",
  location_name: null,
  cycle_service_name: null,
};

const AGENDA: DayAgenda = {
  date: "2026-08-22",
  timezone: "America/Sao_Paulo",
  appointments: [APPOINTMENT],
  conflict_count: 0,
};

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    apiFetch: vi.fn(async (path: string) => {
      if (path.includes("/organization/preferences")) return { data: PREFS };
      if (path.includes("/agenda/day")) return { data: AGENDA };
      if (path.includes("/routines/board")) {
        return {
          data: {
            today: "2026-08-22",
            groups: [
              {
                label: "Revisão",
                count: 1,
                occurrence_type: "plan_review",
                items: [
                  {
                    id: "occ-1",
                    name: "Revisar plano",
                    client_id: "c1",
                    client_name: "Aluna Teste",
                    overdue: true,
                    type_label: "Revisão",
                  },
                ],
              },
            ],
          },
        };
      }
      return { data: null };
    }),
  };
});

import AgendaPage from "@/app/app/agenda/page";

describe("Agenda page — status is color-coded, not plain text", () => {
  it("shows the appointment status as a badge with the correct tone, separate from location/service text", async () => {
    render(<AgendaPage />);
    const badge = await screen.findByText("Falta do cliente");
    expect(badge).toHaveClass("badge-neutral");
  });

  it("marks an overdue routine action with a danger badge instead of plain accent text", async () => {
    render(<AgendaPage />);
    const badge = await screen.findByText("Vencida");
    expect(badge).toHaveClass("badge-danger");
  });
});
