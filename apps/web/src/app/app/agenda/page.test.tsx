import { render, within, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  Appointment,
  AvailabilityDay,
  AvailabilitySettings,
  DayAgenda,
  OrgPreferences,
} from "@/lib/api";

const replaceMock = vi.fn();
let currentDay = "2026-08-22";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(`day=${currentDay}`),
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

// Same occurrence-shape convention as the Rotinas hub board response.
const OPEN_TODAY = {
  id: "occ-open",
  client_id: "c1",
  client_name: "Aluna Teste",
  status: "open",
  status_label: "Aberta",
  due_on: "2026-08-22",
  operational_date: "2026-08-22",
  overdue: false,
  name: "Revisar plano",
  type_label: "Revisão",
};

const OVERDUE_ELSEWHERE = {
  id: "occ-overdue",
  client_id: "c2",
  client_name: "Outro Aluno",
  status: "open",
  status_label: "Aberta",
  due_on: "2026-08-19",
  operational_date: "2026-08-19",
  overdue: true,
  name: "Feedback pendente",
  type_label: "Feedback",
};

const COMPLETED_TODAY = {
  id: "occ-completed",
  client_id: "c3",
  client_name: "Cliente Concluído",
  status: "completed",
  status_label: "Concluída",
  due_on: "2026-08-22",
  operational_date: "2026-08-22",
  overdue: false,
  name: "Rotina já feita",
  type_label: "Tarefa",
};

const OPEN_TODAY_2 = {
  id: "occ-open-2",
  client_id: "c4",
  client_name: "Segundo Aluno",
  status: "open",
  status_label: "Aberta",
  due_on: "2026-08-22",
  operational_date: "2026-08-22",
  overdue: false,
  name: "Ligar para aluno",
  type_label: "Contato",
};

const OPEN_TODAY_3 = {
  id: "occ-open-3",
  client_id: "c5",
  client_name: "Terceiro Aluno",
  status: "open",
  status_label: "Aberta",
  due_on: "2026-08-22",
  operational_date: "2026-08-22",
  overdue: false,
  name: "Conferir pagamento",
  type_label: "Financeiro",
};

// Only set by the capping test below — kept empty otherwise so every
// other test keeps its original, smaller fixture set unaffected.
let extraOpenItems: typeof OPEN_TODAY[] = [];
let extraCompletedItems: typeof COMPLETED_TODAY[] = [];

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for the vi.fn() call-signature type; the wrapper below always forwards it
const apiFetchMock = vi.fn(async (path: string, init?: RequestInit) => {
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
  if (path.includes("/routines/occurrences/") && path.endsWith("/decide")) {
    return { data: { ok: true } };
  }
  if (path.includes("/routines/board")) {
    if (path.includes("include_completed=true")) {
      // Full-board shape (no `on`) — same query the Rotinas hub already
      // issues; cancelled is never requested, so it never comes back.
      return {
        data: {
          today: "2026-08-22",
          groups: [
            { items: [OPEN_TODAY, OVERDUE_ELSEWHERE, COMPLETED_TODAY, ...extraCompletedItems] },
          ],
        },
      };
    }
    // `on=<day>` day-view shape — never returns completed occurrences by
    // design; overdue-elsewhere is folded in only when `on` is today.
    const dayParam = new URL(path, "http://x").searchParams.get("on");
    const items =
      dayParam === "2026-08-22"
        ? [OPEN_TODAY, OVERDUE_ELSEWHERE, ...extraOpenItems]
        : dayParam === "2026-08-23"
          ? []
          : [];
    return { data: { today: "2026-08-22", groups: [{ items }] } };
  }
  return { data: null };
});

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    apiFetch: (path: string, init?: RequestInit) => apiFetchMock(path, init),
  };
});

import AgendaPage from "@/app/app/agenda/page";

describe("Agenda — Rotinas do dia (desktop)", () => {
  it("scenario 1: shows an open routine scheduled for the selected day, with client and 'Hoje' as the due label", async () => {
    currentDay = "2026-08-22";
    const { container } = render(<AgendaPage />);
    const desktop = container.querySelector(".hidden.lg\\:block") as HTMLElement;
    await within(desktop).findByText("Revisar plano");
    expect(within(desktop).getByText(/Aluna Teste.*Hoje/)).toBeInTheDocument();
  });

  it("scenario 2: shows a completed routine for the day, visually reduced, with no Concluir/Adiar actions", async () => {
    currentDay = "2026-08-22";
    const { container } = render(<AgendaPage />);
    const desktop = container.querySelector(".hidden.lg\\:block") as HTMLElement;
    const row = (await within(desktop).findByText("Rotina já feita")).closest("li") as HTMLElement;
    expect(row.className).toContain("opacity-60");
    expect(within(row).queryByRole("button", { name: "Concluir" })).not.toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: "Adiar" })).not.toBeInTheDocument();
    expect(within(row).getByText("Concluída")).toBeInTheDocument();
  });

  it("scenario 3: never shows a cancelled routine by default", async () => {
    currentDay = "2026-08-22";
    const { container } = render(<AgendaPage />);
    const desktop = container.querySelector(".hidden.lg\\:block") as HTMLElement;
    const section = await within(desktop).findByLabelText("Rotinas do dia");
    await within(section).findByText("Revisar plano");
    expect(within(section).queryByText(/cancelad/i)).not.toBeInTheDocument();
    // The board fetch never even requests cancelled items.
    const boardCalls = apiFetchMock.mock.calls.filter((c) => String(c[0]).includes("/routines/board"));
    expect(boardCalls.some((c) => String(c[0]).includes("include_cancelled"))).toBe(false);
  });

  it("scenario 4: overdue-from-other-days never mixes into the selected day's list — only a compact banner", async () => {
    currentDay = "2026-08-22";
    const { container } = render(<AgendaPage />);
    const desktop = container.querySelector(".hidden.lg\\:block") as HTMLElement;
    await within(desktop).findByText("Revisar plano");
    expect(within(desktop).queryByText("Feedback pendente")).not.toBeInTheDocument();
    const banner = within(desktop).getByRole("link", { name: /1 rotina atrasada/ });
    expect(banner).toHaveAttribute("href", "/app/routines");
  });

  it("scenario 5: Concluir calls decide() and refreshes the Agenda's routine list", async () => {
    currentDay = "2026-08-22";
    const { container } = render(<AgendaPage />);
    const desktop = container.querySelector(".hidden.lg\\:block") as HTMLElement;
    await within(desktop).findByText("Revisar plano");
    apiFetchMock.mockClear();
    const completeBtn = within(desktop).getByRole("button", { name: "Concluir" });
    fireEvent.click(completeBtn);
    await waitFor(() => {
      const decideCall = apiFetchMock.mock.calls.find((c) => String(c[0]).endsWith("/decide"));
      expect(decideCall?.[0]).toBe("/api/v1/routines/occurrences/occ-open/decide");
      expect(decideCall?.[1]).toEqual(expect.objectContaining({ method: "POST" }));
    });
    await waitFor(() => {
      const reloadCall = apiFetchMock.mock.calls.find((c) => String(c[0]).includes("/routines/board?on="));
      expect(reloadCall).toBeTruthy();
    });
  });

  it("scenario 5b: Adiar sends deferred_until as the next day", async () => {
    currentDay = "2026-08-22";
    const { container } = render(<AgendaPage />);
    const desktop = container.querySelector(".hidden.lg\\:block") as HTMLElement;
    await within(desktop).findByText("Revisar plano");
    const deferBtn = within(desktop).getByRole("button", { name: "Adiar" });
    fireEvent.click(deferBtn);
    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/api/v1/routines/occurrences/occ-open/decide",
        expect.objectContaining({
          body: JSON.stringify({ status: "deferred", deferred_until: "2026-08-23" }),
        }),
      );
    });
  });

  it("scenario 6: changing the selected date refetches and reflects the new day (empty here)", async () => {
    currentDay = "2026-08-23";
    const { container } = render(<AgendaPage />);
    const desktop = container.querySelector(".hidden.lg\\:block") as HTMLElement;
    await waitFor(() => {
      const call = apiFetchMock.mock.calls.find((c) => String(c[0]).includes("/routines/board?on=2026-08-23"));
      expect(call).toBeTruthy();
    });
    expect(within(desktop).queryByLabelText("Rotinas do dia")).not.toBeInTheDocument();
    expect(within(desktop).queryByText("Revisar plano")).not.toBeInTheDocument();
  });
});

describe("Agenda — Rotinas do dia (mobile)", () => {
  afterEach(() => {
    extraOpenItems = [];
    extraCompletedItems = [];
  });

  it("scenario 7: mobile shows the day's routines as compact rows, separate from appointments, never the full hub", async () => {
    currentDay = "2026-08-22";
    const { container } = render(<AgendaPage />);
    const mobile = container.querySelector('[aria-label="Agenda do dia"]') as HTMLElement;
    const section = await within(mobile).findByLabelText("Rotinas do dia");
    await within(section).findByText("Revisar plano");
    // Appointments and routines never share one list.
    const apptList = within(mobile).getByText("Aluna Teste", { selector: "p" }).closest("ul");
    expect(within(apptList as HTMLElement).queryByText("Revisar plano")).not.toBeInTheDocument();
  });

  it("mobile shows a completed item too when the combined list fits under the cap — no 'Ver todas' needed", async () => {
    currentDay = "2026-08-22";
    const { container } = render(<AgendaPage />);
    const mobile = container.querySelector('[aria-label="Agenda do dia"]') as HTMLElement;
    const section = await within(mobile).findByLabelText("Rotinas do dia");
    // One open item + one completed item — two total, well under the cap
    // of three, so both show and nothing is hidden behind "Ver todas".
    await within(section).findByText("Revisar plano");
    const completedRow = (await within(section).findByText("Rotina já feita")).closest("li")!;
    expect(within(completedRow).queryByRole("button", { name: "Concluir" })).not.toBeInTheDocument();
    expect(within(completedRow).queryByRole("button", { name: "Adiar" })).not.toBeInTheDocument();
    expect(within(section).queryByRole("link", { name: "Ver todas" })).not.toBeInTheDocument();
  });

  it("mobile caps the combined open+completed list at three, and a completed item within the cap still appears reduced", async () => {
    currentDay = "2026-08-22";
    extraOpenItems = [OPEN_TODAY_2, OPEN_TODAY_3];
    const { container } = render(<AgendaPage />);
    const mobile = container.querySelector('[aria-label="Agenda do dia"]') as HTMLElement;
    const section = await within(mobile).findByLabelText("Rotinas do dia");
    // Combined = [OPEN_TODAY, OPEN_TODAY_2, OPEN_TODAY_3, COMPLETED_TODAY]
    // = 4 items — capped at 3, so the completed one (last in the shared,
    // normalized order) is the one that gets cut here, and "Ver todas"
    // appears. This proves capping happens on the SAME shared list the
    // desktop uses, not a smaller "open items only" list that ignores
    // completed items entirely.
    await within(section).findByText("Revisar plano");
    await within(section).findByText("Ligar para aluno");
    await within(section).findByText("Conferir pagamento");
    expect(within(section).queryByText("Rotina já feita")).not.toBeInTheDocument();
    const seeAll = within(section).getByRole("link", { name: "Ver todas" });
    expect(seeAll).toHaveAttribute("href", "/app/routines");
  });

  it("a completed item that falls within the first three of the combined list is not filtered out just for being completed", async () => {
    currentDay = "2026-08-22";
    extraOpenItems = [OPEN_TODAY_2];
    const { container } = render(<AgendaPage />);
    const mobile = container.querySelector('[aria-label="Agenda do dia"]') as HTMLElement;
    const section = await within(mobile).findByLabelText("Rotinas do dia");
    // Combined = [OPEN_TODAY, OPEN_TODAY_2, COMPLETED_TODAY] = exactly 3 —
    // all three fit under the cap, including the completed one.
    await within(section).findByText("Revisar plano");
    await within(section).findByText("Ligar para aluno");
    const completedRow = (await within(section).findByText("Rotina já feita")).closest("li")!;
    expect(within(completedRow).queryByRole("button", { name: "Concluir" })).not.toBeInTheDocument();
    expect(within(section).queryByRole("link", { name: "Ver todas" })).not.toBeInTheDocument();
  });
});

describe("Agenda page — desktop: professional calendar, never a stretched list", () => {
  it("renders inside the hidden lg:block tree with a Day/Week toggle and the appointment's real client name", async () => {
    currentDay = "2026-08-22";
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

  it("offers a visible link to Disponibilidade config and a Novo compromisso action", async () => {
    const { container } = render(<AgendaPage />);
    const desktop = container.querySelector(".hidden.lg\\:block") as HTMLElement;
    await within(desktop).findByText("Aluna Teste");
    expect(within(desktop).getByRole("link", { name: /Disponibilidade/i })).toHaveAttribute(
      "href",
      "/app/settings/workspace",
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
    currentDay = "2026-08-22";
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
    const clientNameEl = await within(mobile).findByText("Aluna Teste", { selector: "p" });
    const row = clientNameEl.closest("li") as HTMLElement;
    const clientLink = within(row).getByRole("link", { name: "Abrir cliente" });
    expect(clientLink).toHaveAttribute("href", "/app/clients/c1");
  });

  it("offers a prominent 'Perguntar à Cronia' entry point prefilling the assistant, never auto-sending", async () => {
    const { container } = render(<AgendaPage />);
    const mobile = container.querySelector('[aria-label="Agenda do dia"]') as HTMLElement;
    const aiLink = within(mobile).getByRole("link", { name: /Perguntar à Cronia/i });
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
    await within(mobile).findByText("Aluna Teste", { selector: "p" });
    const link = within(mobile).getByRole("link", { name: /^Agendar$/i });
    expect(link).toHaveAttribute("href", "/app/appointments/new?day=2026-08-22");
  });
});
