import { render, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  Appointment,
  AvailabilityDay,
  AvailabilitySettings,
  DayAgenda,
  OrgPreferences,
} from "@/lib/api";

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

const UNCONFIGURED_SETTINGS: AvailabilitySettings = {
  configured: false,
  days: [],
};

const AVAILABILITY_DAY: AvailabilityDay = {
  date: "2026-08-22",
  weekday: 5,
  timezone: "America/Sao_Paulo",
  configured: true,
  is_active: true,
  duration_minutes: 60,
  slots: [{ starts_at: "2026-08-22T14:00:00Z", ends_at: "2026-08-22T15:00:00Z", label: "11:00" }],
};

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    apiFetch: vi.fn(async (path: string) => {
      if (path.includes("/organization/preferences")) return { data: PREFS };
      if (path.includes("/availability/settings")) return { data: UNCONFIGURED_SETTINGS };
      if (path.includes("/availability/day")) return { data: AVAILABILITY_DAY };
      if (path.includes("/agenda/day")) return { data: AGENDA };
      if (path.includes("/agenda/range")) {
        return {
          data: {
            timezone: "America/Sao_Paulo",
            days: [AGENDA, { ...AGENDA, date: "2026-08-23", appointments: [] }],
          },
        };
      }
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

describe("Agenda page — desktop: professional calendar, never a stretched list", () => {
  it("renders inside the hidden lg:block tree with a Day/Week toggle and the appointment's real client name", async () => {
    const { container } = render(<AgendaPage />);
    const desktop = container.querySelector(".hidden.lg\\:block");
    expect(desktop).not.toBeNull();
    await within(desktop as HTMLElement).findByText("Aluna Teste");
    expect(within(desktop as HTMLElement).getByRole("button", { name: "Dia" })).toBeInTheDocument();
    expect(within(desktop as HTMLElement).getByRole("button", { name: "Semana" })).toBeInTheDocument();
  });

  it("shows the appointment's status label as real text inside the calendar block", async () => {
    const { container } = render(<AgendaPage />);
    const desktop = container.querySelector(".hidden.lg\\:block") as HTMLElement;
    await within(desktop).findByText("Falta do cliente");
  });

  it("keeps the routines side panel reachable alongside the grid", async () => {
    const { container } = render(<AgendaPage />);
    const desktop = container.querySelector(".hidden.lg\\:block") as HTMLElement;
    await within(desktop).findByText("Revisar plano");
    await within(desktop).findByText("Aluna Teste");
  });

  it("offers a visible link to Disponibilidade config and a Novo compromisso action", async () => {
    const { container } = render(<AgendaPage />);
    const desktop = container.querySelector(".hidden.lg\\:block") as HTMLElement;
    await within(desktop).findByText("Aluna Teste");
    expect(within(desktop).getByRole("link", { name: /Disponibilidade/i })).toHaveAttribute(
      "href",
      "/app/availability",
    );
    expect(within(desktop).getByRole("link", { name: /Novo compromisso/i })).toBeInTheDocument();
  });

  it("shows the unconfigured-availability nudge without inventing a configured schedule", async () => {
    const { container } = render(<AgendaPage />);
    const desktop = container.querySelector(".hidden.lg\\:block") as HTMLElement;
    await within(desktop).findByText(/Configure seus horários de atendimento/i);
  });
});

describe("Agenda page — mobile: daily timeline + assistant, never the desktop grid compressed", () => {
  it("renders inside a lg:hidden tree, independent from the desktop grid", async () => {
    const { container } = render(<AgendaPage />);
    const mobile = container.querySelector('[aria-label="Agenda do dia"]');
    expect(mobile).not.toBeNull();
    expect(mobile!.className).toContain("lg:hidden");
    await within(mobile as HTMLElement).findByText("Aluna Teste");
  });

  it("shows the appointment status as a real Badge with the correct tone", async () => {
    const { container } = render(<AgendaPage />);
    const mobile = container.querySelector('[aria-label="Agenda do dia"]') as HTMLElement;
    const badge = await within(mobile).findByText("Falta do cliente");
    expect(badge).toHaveClass("badge-neutral");
  });

  it("offers a manual 'Abrir cliente' link per appointment — the AI is never the only path", async () => {
    const { container } = render(<AgendaPage />);
    const mobile = container.querySelector('[aria-label="Agenda do dia"]') as HTMLElement;
    const clientNameEl = await within(mobile).findByText("Aluna Teste");
    // Scoped to the appointment row itself — the routines panel below also
    // links to the same client with an identically-labeled "Abrir cliente"
    // link, so a page-wide query would be ambiguous.
    const row = clientNameEl.closest("li") as HTMLElement;
    const clientLink = within(row).getByRole("link", { name: "Abrir cliente" });
    expect(clientLink).toHaveAttribute("href", "/app/clients/c1");
  });

  it("offers a prominent 'Perguntar à IA' entry point prefilling the assistant, never auto-sending", async () => {
    const { container } = render(<AgendaPage />);
    const mobile = container.querySelector('[aria-label="Agenda do dia"]') as HTMLElement;
    const aiLink = within(mobile).getByRole("link", { name: /Perguntar à IA/i });
    expect(aiLink.getAttribute("href")).toContain("/app/assistant?prompt=");
  });

  it("shows real free slots as a collapsed, expandable summary — not the full desktop availability list", async () => {
    const { container } = render(<AgendaPage />);
    const mobile = container.querySelector('[aria-label="Agenda do dia"]') as HTMLElement;
    await within(mobile).findByText(/horário\(s\) livre\(s\) hoje/i);
    const slotLink = within(mobile).getByRole("link", { name: /11:00.*Dispon[ií]vel/i });
    expect(slotLink).toHaveAttribute(
      "href",
      "/app/appointments/new?day=2026-08-22&start=11:00&end=12:00",
    );
  });

  it("offers a manual Agendar action independent of the assistant", async () => {
    const { container } = render(<AgendaPage />);
    const mobile = container.querySelector('[aria-label="Agenda do dia"]') as HTMLElement;
    await within(mobile).findByText("Aluna Teste"); // wait for org-local day to resolve
    const link = within(mobile).getByRole("link", { name: /^Agendar$/i });
    expect(link).toHaveAttribute("href", "/app/appointments/new?day=2026-08-22");
  });

  it("keeps routine actions reachable on mobile too — nothing existing disappears", async () => {
    const { container } = render(<AgendaPage />);
    const mobile = container.querySelector('[aria-label="Agenda do dia"]') as HTMLElement;
    await within(mobile).findByText("Revisar plano");
  });
});
