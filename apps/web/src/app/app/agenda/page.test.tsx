import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Appointment, AvailabilityDay, DayAgenda, OrgPreferences } from "@/lib/api";

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

let availabilityResponse: { data?: AvailabilityDay; error?: unknown } = {
  data: {
    date: "2026-08-22",
    weekday: 5,
    timezone: "America/Sao_Paulo",
    configured: false,
    is_active: false,
    duration_minutes: 60,
    slots: [],
  },
};

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    apiFetch: vi.fn(async (path: string) => {
      if (path.includes("/organization/preferences")) return { data: PREFS };
      if (path.includes("/availability/day")) return availabilityResponse;
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

describe("Agenda page — disponibilidade integrada (Ver horários livres)", () => {
  it("does not fetch availability until the toggle is turned on", async () => {
    render(<AgendaPage />);
    await screen.findByText("Falta do cliente");
    expect(screen.getByLabelText("Ver horários livres")).not.toBeChecked();
    expect(screen.queryByText(/Configure seus horários de atendimento/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Nenhum horário disponível neste dia.")).not.toBeInTheDocument();
  });

  it("prompts to configure the journey when none exists yet", async () => {
    availabilityResponse = {
      data: {
        date: "2026-08-22",
        weekday: 5,
        timezone: "America/Sao_Paulo",
        configured: false,
        is_active: false,
        duration_minutes: 60,
        slots: [],
      },
    };
    render(<AgendaPage />);
    fireEvent.click(screen.getByLabelText("Ver horários livres"));
    expect(
      await screen.findByText(/Configure seus horários de atendimento/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Configurar horários" })).toHaveAttribute(
      "href",
      "/app/availability",
    );
  });

  it("shows a day-off message distinctly from an unconfigured journey", async () => {
    availabilityResponse = {
      data: {
        date: "2026-08-22",
        weekday: 5,
        timezone: "America/Sao_Paulo",
        configured: true,
        is_active: false,
        duration_minutes: 60,
        slots: [],
      },
    };
    render(<AgendaPage />);
    fireEvent.click(screen.getByLabelText("Ver horários livres"));
    expect(await screen.findByText("Nenhum horário disponível neste dia.")).toBeInTheDocument();
    expect(screen.queryByText(/Configurar horários/i)).not.toBeInTheDocument();
  });

  it("renders real free slots as links that prefill the new-appointment form", async () => {
    availabilityResponse = {
      data: {
        date: "2026-08-22",
        weekday: 5,
        timezone: "America/Sao_Paulo",
        configured: true,
        is_active: true,
        duration_minutes: 60,
        slots: [
          { starts_at: "2026-08-22T11:00:00Z", ends_at: "2026-08-22T12:00:00Z", label: "08:00" },
          { starts_at: "2026-08-22T14:00:00Z", ends_at: "2026-08-22T15:00:00Z", label: "11:00" },
        ],
      },
    };
    render(<AgendaPage />);
    fireEvent.click(screen.getByLabelText("Ver horários livres"));
    const slotLink = await screen.findByRole("link", { name: /08:00.*Dispon[ií]vel/i });
    expect(slotLink).toHaveAttribute(
      "href",
      "/app/appointments/new?day=2026-08-22&start=08:00&end=09:00",
    );
    expect(screen.getByRole("link", { name: /11:00.*Dispon[ií]vel/i })).toBeInTheDocument();
  });
});

describe("Agenda page — desktop workspace layout", () => {
  it("splits into a compromissos column plus a routines side column from lg upward, and both stay reachable", async () => {
    const { container } = render(<AgendaPage />);
    await screen.findByText("Falta do cliente");
    await screen.findByText("Revisar plano");

    const grid = container.querySelector(".lg\\:grid-cols-\\[minmax\\(0\\,1fr\\)_320px\\]");
    expect(grid).not.toBeNull();
    // Both the appointment card and the routine action must live inside that
    // same responsive wrapper — neither one got dropped by the restructure.
    expect(grid).toContainElement(screen.getByText("Aluna Teste"));
    expect(grid).toContainElement(screen.getByText("Revisar plano"));
  });

  it("lays appointment cards out as a 2-column grid from xl upward, single column below that", async () => {
    const { container } = render(<AgendaPage />);
    await screen.findByText("Falta do cliente");
    const list = container.querySelector('ul[class*="space-y-2.5"]');
    expect(list).not.toBeNull();
    expect(list!.className).toContain("xl:grid");
    expect(list!.className).toContain("xl:grid-cols-2");
  });
});
