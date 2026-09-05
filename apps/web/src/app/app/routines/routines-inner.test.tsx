import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  professionCode: "personal_trainer" as string | null,
  useCases: ["workouts"] as string[] | null,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    apiFetch: vi.fn(),
  };
});

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    me: {
      organization: {
        profession_code: authState.professionCode,
        use_cases: authState.useCases,
      },
    },
  }),
}));

import { apiFetch } from "@/lib/api";
import RoutinesPageInner from "@/app/app/routines/routines-inner";

function mockApi() {
  vi.mocked(apiFetch).mockImplementation(async (path: string) => {
    if (path === "/api/v1/routines") return { data: [], error: undefined, status: 200 };
    if (path === "/api/v1/routines?status=paused")
      return { data: [], error: undefined, status: 200 };
    if (path.startsWith("/api/v1/routines/board"))
      return { data: { groups: [] }, error: undefined, status: 200 };
    return { data: null, error: { code: "not_found", message: "unexpected path" }, status: 404 };
  });
}

describe("RoutinesPageInner — nomenclature has no flash", () => {
  beforeEach(() => {
    authState.professionCode = "personal_trainer";
    authState.useCases = ["workouts"];
    vi.mocked(apiFetch).mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows the workout-specific routine type from the very first render, no flash", () => {
    mockApi();
    render(<RoutinesPageInner />);
    fireEvent.click(screen.getByRole("button", { name: /Criar rotina personalizada/i }));
    const select = screen.getByRole("combobox", { name: "Tipo" });
    // No `await`: capability resolution must already reflect the session's
    // profession/use_cases on this very first render, not after a fetch.
    expect(
      within(select).getByText("Revisar referência de treino (externa)"),
    ).toBeInTheDocument();
  });

  it("hides the workout-specific type when the organization's capabilities don't include it", () => {
    authState.professionCode = "nutritionist";
    authState.useCases = [];
    mockApi();
    render(<RoutinesPageInner />);
    fireEvent.click(screen.getByRole("button", { name: /Criar rotina personalizada/i }));
    const select = screen.getByRole("combobox", { name: "Tipo" });
    expect(
      within(select).queryByText("Revisar referência de treino (externa)"),
    ).not.toBeInTheDocument();
  });

  it("never calls /organization/profession — the session already carries use_cases", async () => {
    mockApi();
    render(<RoutinesPageInner />);
    await screen.findByRole("button", { name: /Criar rotina personalizada/i });
    const calls = vi.mocked(apiFetch).mock.calls.map(([path]) => path);
    expect(calls).not.toContain("/api/v1/organization/profession");
  });
});

const TODAY = "2026-08-14";

const OVERDUE_ITEM = {
  id: "occ-overdue",
  client_id: "c1",
  client_name: "Ana Overdue",
  plan_title: null,
  occurrence_type: "custom_task",
  type_label: "Tarefa",
  status: "open",
  status_label: "Aberta",
  due_on: "2026-08-10",
  operational_date: "2026-08-10",
  overdue: true,
  source: "routine",
  name: "Cobrar Ana",
  routine_id: "r-once",
};

const TODAY_ITEM = {
  id: "occ-today",
  client_id: "c2",
  client_name: "Gabriel Hoje",
  plan_title: null,
  occurrence_type: "plan_review",
  type_label: "Revisar plano",
  status: "open",
  status_label: "Aberta",
  due_on: TODAY,
  operational_date: TODAY,
  overdue: false,
  source: "computed",
  name: null,
  routine_id: null,
};

const RECURRING_ITEM = {
  id: "occ-recurring",
  client_id: "c3",
  client_name: "Carla Recorrente",
  plan_title: null,
  occurrence_type: "feedback_due",
  type_label: "Registrar feedback",
  status: "open",
  status_label: "Aberta",
  due_on: "2026-08-20",
  operational_date: "2026-08-20",
  overdue: false,
  source: "routine",
  name: "Pedir feedback",
  routine_id: "r-weekly",
};

const COMPLETED_ITEM = {
  id: "occ-done",
  client_id: "c4",
  client_name: "Bia Concluida",
  plan_title: null,
  occurrence_type: "custom_task",
  type_label: "Tarefa",
  status: "completed",
  status_label: "Concluída",
  due_on: "2026-08-05",
  operational_date: "2026-08-05",
  overdue: false,
  source: "routine",
  name: "Ligar para Bia",
  routine_id: "r-once",
};

function mockRichApi() {
  vi.mocked(apiFetch).mockImplementation(async (path: string) => {
    if (path === "/api/v1/routines")
      return {
        data: [
          { id: "r-once", name: "Cobrar Ana", task_type: "check_payment", weekday: null, recurrence: "once", lead_days: 0, next_run_on: "2026-08-10", status: "active" },
          { id: "r-weekly", name: "Pedir feedback semanal", task_type: "request_feedback", weekday: 2, recurrence: "weekly", lead_days: 0, next_run_on: "2026-08-20", status: "active" },
        ],
        error: undefined,
        status: 200,
      };
    if (path === "/api/v1/routines?status=paused")
      return { data: [], error: undefined, status: 200 };
    if (path === "/api/v1/clients")
      return {
        data: [
          { id: "c1", full_name: "Ana Overdue" },
          { id: "c2", full_name: "Gabriel Hoje" },
        ],
        error: undefined,
        status: 200,
      };
    if (path.startsWith("/api/v1/routines/board")) {
      const includeCompleted = path.includes("include_completed=true");
      const items = includeCompleted
        ? [OVERDUE_ITEM, TODAY_ITEM, RECURRING_ITEM, COMPLETED_ITEM]
        : [OVERDUE_ITEM, TODAY_ITEM, RECURRING_ITEM];
      const groups = [
        { occurrence_type: "custom_task", label: "Tarefa", count: 1, occurrence_count: 1, client_count: 1, overdue_count: 1, items: items.filter((i) => i.occurrence_type === "custom_task") },
        { occurrence_type: "plan_review", label: "Revisar plano", count: 1, occurrence_count: 1, client_count: 1, overdue_count: 0, items: items.filter((i) => i.occurrence_type === "plan_review") },
        { occurrence_type: "feedback_due", label: "Registrar feedback", count: 1, occurrence_count: 1, client_count: 1, overdue_count: 0, items: items.filter((i) => i.occurrence_type === "feedback_due") },
      ].filter((g) => g.items.length > 0);
      return { data: { today: TODAY, groups }, error: undefined, status: 200 };
    }
    if (path.includes("/decide")) return { data: { ok: true }, error: undefined, status: 200 };
    return { data: null, error: { code: "not_found", message: "unexpected path" }, status: 404 };
  });
}

describe("RoutinesPageInner desktop — central de trabalho densa", () => {
  beforeEach(() => {
    authState.professionCode = "personal_trainer";
    authState.useCases = ["workouts"];
    vi.mocked(apiFetch).mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("Pendências groups open items visually as Atrasadas/Hoje/Próximas, never mixed with completed work", async () => {
    mockRichApi();
    const { container } = render(<RoutinesPageInner />);
    const desktop = container.querySelector(".hidden.lg\\:block") as HTMLElement;
    const table = await within(desktop).findByRole("table");
    await within(table).findByText("Ana Overdue");
    expect(within(table).getByText("Gabriel Hoje")).toBeInTheDocument();
    expect(within(table).getByText("Carla Recorrente")).toBeInTheDocument();
    expect(within(table).queryByText("Bia Concluida")).not.toBeInTheDocument();

    // Each bucket has its own visible heading row, all shown at once —
    // no tab to click through to see the rest.
    expect(within(table).getByText(/Atrasadas · 1/)).toBeInTheDocument();
    expect(within(table).getByText(/Hoje · 1/)).toBeInTheDocument();
    expect(within(table).getByText(/Próximas · 1/)).toBeInTheDocument();

    // The heading order in the DOM is Atrasadas, then Hoje, then Próximas.
    const headings = within(table)
      .getAllByText(/^(Atrasadas|Hoje|Próximas) · \d/)
      .map((el) => el.textContent);
    expect(headings).toEqual([
      expect.stringContaining("Atrasadas"),
      expect.stringContaining("Hoje"),
      expect.stringContaining("Próximas"),
    ]);
  });

  it("Histórico is a separate area — never the same table Pendências shows, and never floods it with old cancelled work", async () => {
    mockRichApi();
    const { container } = render(<RoutinesPageInner />);
    const desktop = container.querySelector(".hidden.lg\\:block") as HTMLElement;
    const pendingTable = await within(desktop).findByRole("table");
    await within(pendingTable).findByText("Ana Overdue");

    fireEvent.click(within(desktop).getByRole("tab", { name: /Histórico/i }));
    const historyTable = await within(desktop).findByRole("table");
    expect(await within(historyTable).findByText("Bia Concluida")).toBeInTheDocument();
    expect(within(historyTable).queryByText("Ana Overdue")).not.toBeInTheDocument();
    expect(within(historyTable).queryByText("Gabriel Hoje")).not.toBeInTheDocument();

    // Back on Pendências, the completed item never shows up there either.
    fireEvent.click(within(desktop).getByRole("tab", { name: /Pendências/i }));
    const backToPending = await within(desktop).findByRole("table");
    expect(within(backToPending).queryByText("Bia Concluida")).not.toBeInTheDocument();
  });

  it("Automações is its own area — Suas rotinas and sugestões, no occurrence table there", async () => {
    mockRichApi();
    const { container } = render(<RoutinesPageInner />);
    const desktop = container.querySelector(".hidden.lg\\:block") as HTMLElement;
    await within(desktop).findByRole("table");
    fireEvent.click(within(desktop).getByRole("tab", { name: /Automações/i }));
    expect(within(desktop).queryByRole("table")).not.toBeInTheDocument();
    expect(within(desktop).getByText("Suas rotinas (definições)")).toBeInTheDocument();
    expect(within(desktop).getByText("Cobrar Ana")).toBeInTheDocument();
  });

  it("search narrows the list by client name", async () => {
    mockRichApi();
    const { container } = render(<RoutinesPageInner />);
    const desktop = container.querySelector(".hidden.lg\\:block") as HTMLElement;
    const table = await within(desktop).findByRole("table");
    await within(table).findByText("Ana Overdue");
    fireEvent.change(within(desktop).getByLabelText("Buscar rotina"), {
      target: { value: "Gabriel" },
    });
    expect(within(table).getByText("Gabriel Hoje")).toBeInTheDocument();
    expect(within(table).queryByText("Ana Overdue")).not.toBeInTheDocument();
  });

  it("Concluir calls decide(completed) for the real occurrence id", async () => {
    mockRichApi();
    const { container } = render(<RoutinesPageInner />);
    const desktop = container.querySelector(".hidden.lg\\:block") as HTMLElement;
    const table = await within(desktop).findByRole("table");
    await within(table).findByText("Ana Overdue");
    const row = within(table).getByText("Ana Overdue").closest("tr") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Concluir" }));
    await new Promise((r) => setTimeout(r, 0));
    const call = vi
      .mocked(apiFetch)
      .mock.calls.find(([path]) => path === "/api/v1/routines/occurrences/occ-overdue/decide");
    expect(call).toBeTruthy();
    expect(JSON.parse((call![1] as RequestInit).body as string)).toEqual({ status: "completed" });
  });

  it("offers Cancelar as a secondary action inside the row's menu, not at the same weight as Concluir", async () => {
    mockRichApi();
    const { container } = render(<RoutinesPageInner />);
    const desktop = container.querySelector(".hidden.lg\\:block") as HTMLElement;
    const table = await within(desktop).findByRole("table");
    await within(table).findByText("Ana Overdue");
    const row = within(table).getByText("Ana Overdue").closest("tr") as HTMLElement;
    expect(within(row).queryByRole("button", { name: "Cancelar" })).not.toBeInTheDocument();
    fireEvent.click(within(row).getByRole("button", { name: /Mais ações/i }));
    fireEvent.click(within(row).getByRole("menuitem", { name: "Cancelar" }));
    await new Promise((r) => setTimeout(r, 0));
    const call = vi
      .mocked(apiFetch)
      .mock.calls.find(([path]) => path === "/api/v1/routines/occurrences/occ-overdue/decide");
    expect(JSON.parse((call![1] as RequestInit).body as string)).toEqual({ status: "cancelled" });
  });

  it("never offers Concluir/Adiar/Cancelar again on a cancelled or completed occurrence", async () => {
    mockRichApi();
    const { container } = render(<RoutinesPageInner />);
    const desktop = container.querySelector(".hidden.lg\\:block") as HTMLElement;
    await within(desktop).findByRole("table");
    fireEvent.click(within(desktop).getByRole("tab", { name: /Histórico/i }));
    const historyTable = await within(desktop).findByRole("table");
    const row = (await within(historyTable).findByText("Bia Concluida")).closest("tr") as HTMLElement;
    expect(within(row).queryByRole("button", { name: "Concluir" })).not.toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: /Mais ações/i })).not.toBeInTheDocument();
    expect(within(row).getByText("Concluída")).toBeInTheDocument();
  });

  it("offers an 'Abrir cliente' link per row", async () => {
    mockRichApi();
    const { container } = render(<RoutinesPageInner />);
    const desktop = container.querySelector(".hidden.lg\\:block") as HTMLElement;
    const table = await within(desktop).findByRole("table");
    await within(table).findByText("Ana Overdue");
    const row = within(table).getByText("Ana Overdue").closest("tr") as HTMLElement;
    expect(within(row).getByRole("link", { name: "Abrir cliente" })).toHaveAttribute(
      "href",
      "/app/clients/c1",
    );
  });

  it("never shows the false 'Nada pendente' empty state while the board is still loading", async () => {
    let resolveBoard: (value: { data: { today: string; groups: unknown[] }; status: number }) => void;
    const pendingBoard = new Promise<{ data: { today: string; groups: unknown[] }; status: number }>(
      (resolve) => {
        resolveBoard = resolve;
      },
    );
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      if (path === "/api/v1/routines" || path === "/api/v1/routines?status=paused" || path === "/api/v1/clients") {
        return { data: [], error: undefined, status: 200 };
      }
      if (path.startsWith("/api/v1/routines/board")) return pendingBoard;
      return { data: null, error: { code: "not_found", message: "unexpected path" }, status: 404 };
    });
    const { container } = render(<RoutinesPageInner />);
    const desktop = container.querySelector(".hidden.lg\\:block") as HTMLElement;
    // Still loading: neither the real empty state nor a stray table shows.
    expect(within(desktop).queryByText("Nada pendente")).not.toBeInTheDocument();
    expect(within(desktop).queryByRole("table")).not.toBeInTheDocument();

    resolveBoard!({ data: { today: TODAY, groups: [] }, status: 200 });
    expect(await within(desktop).findByText("Nada pendente")).toBeInTheDocument();
  });
});

describe("RoutinesPageInner mobile — resumo operacional, nunca a tabela densa", () => {
  beforeEach(() => {
    authState.professionCode = "personal_trainer";
    authState.useCases = ["workouts"];
    vi.mocked(apiFetch).mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows real Atrasadas/Hoje counts and a Próxima rotina card in the lg:hidden tree", async () => {
    mockRichApi();
    const { container } = render(<RoutinesPageInner />);
    const mobile = container.querySelector(".lg\\:hidden") as HTMLElement;
    await within(mobile).findByText("Suas rotinas");
    expect(within(mobile).getByText("Atrasadas")).toBeInTheDocument();
    expect(within(mobile).getByText("Próxima rotina")).toBeInTheDocument();
  });
});
