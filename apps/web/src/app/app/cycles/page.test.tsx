import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ me: { organization: { timezone: "America/Sao_Paulo" } } }),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from "@/lib/api";
import CyclesPage from "@/app/app/cycles/page";

const TODAY = "2026-09-03";

const NEARING = {
  id: "cy-near",
  client_id: "cl1",
  service_id: "sv1",
  cycle_template_id: "tpl1",
  cycle_type: "period",
  status: "active",
  starts_on: "2026-08-01",
  ends_on: "2026-09-20",
  weekdays: [0, 2],
  lesson_count: 8,
  lessons_completed: 6,
  value_cents: 30000,
  default_starts_time: "09:00",
  notes: null,
  last_contacted_at: null,
  contact_confirmed_at: null,
  created_at: "",
  updated_at: "",
  client_name: "Ana Vencendo",
  service_name: "Treino Funcional",
  days_remaining: 17,
  is_nearing_end: true,
};

const HEALTHY = {
  ...NEARING,
  id: "cy-ok",
  client_id: "cl2",
  ends_on: "2026-12-01",
  lessons_completed: 1,
  client_name: "Bruno Tranquilo",
  service_name: "Pilates",
  days_remaining: 89,
  is_nearing_end: false,
};

const NEARING_CASE = {
  case_id: "case-near",
  client_id: "cl1",
  client_name: "Ana Vencendo",
  source_cycle_id: "cy-near",
  service_name: "Treino Funcional",
  ends_on: "2026-09-20",
  display_status: "upcoming",
  portal_requested: false,
  next_contact_date: null,
  resolution_reason: null,
  resolution_note: null,
  resolved_at: null,
  successor_cycle_id: null,
};

function mockApi(over: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = {
    "/api/v1/cycles": [NEARING, HEALTHY],
    "/api/v1/receivables": [],
    "/api/v1/agenda/next-appointments": {},
    "/api/v1/renewal-cases?scope=all": [NEARING_CASE],
    "/api/v1/organization/preferences": { local_today: TODAY },
    ...over,
  };
  vi.mocked(apiFetch).mockImplementation(async (path: string) => {
    const p = String(path ?? "");
    if (p in data) return { data: data[p], error: undefined, status: 200 };
    return { data: null, error: { code: "not_found", message: "unexpected" }, status: 404 };
  });
}

/** The desktop table and mobile list only mount once data has arrived, so the
 * trees must be looked up after awaiting a row — not synchronously on render. */
async function renderLoaded(waitForName: string) {
  const utils = render(<CyclesPage />);
  await screen.findAllByText(waitForName);
  return {
    ...utils,
    desktop: utils.container.querySelector(".hidden.lg\\:block") as HTMLElement,
    mobile: utils.container.querySelector("ul.lg\\:hidden") as HTMLElement,
  };
}

describe("CyclesPage — central de contratos, hierarquia e dados reais", () => {
  beforeEach(() => vi.mocked(apiFetch).mockReset());
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("is titled Ciclos and points to Serviços/Modelos so config is not confused with contract", async () => {
    mockApi();
    render(<CyclesPage />);
    expect(await screen.findByRole("heading", { name: "Ciclos" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Serviços" })).toHaveAttribute("href", "/app/services");
    expect(screen.getByRole("link", { name: "Modelos de ciclo" })).toHaveAttribute(
      "href",
      "/app/cycle-templates",
    );
  });

  it("opens on 'Exige atenção' showing only cycles with a real alert", async () => {
    mockApi();
    const { desktop } = await renderLoaded("Ana Vencendo");
    expect(within(desktop).getByText("Ana Vencendo")).toBeInTheDocument();
    expect(within(desktop).queryByText("Bruno Tranquilo")).not.toBeInTheDocument();
  });

  it("shows real progress from lesson counts", async () => {
    mockApi();
    const { desktop } = await renderLoaded("Ana Vencendo");
    expect(within(desktop).getByText("6 de 8")).toBeInTheDocument();
  });

  it("surfaces an overdue receivable as a financial alert with the real amount", async () => {
    mockApi({
      "/api/v1/receivables": [
        {
          id: "r1",
          cycle_id: "cy-ok",
          client_id: "cl2",
          amount_cents: 15000,
          due_on: "2026-08-01",
          status: "pending",
          paid_at: null,
          payment_method: null,
          notes: null,
          created_at: "",
          updated_at: "",
        },
      ],
    });
    const { desktop } = await renderLoaded("Bruno Tranquilo");
    const row = within(desktop).getByText("Bruno Tranquilo").closest("tr") as HTMLElement;
    expect(within(row).getByText(/atrasado/)).toBeInTheDocument();
    expect(within(row).getByText(/150,00/)).toBeInTheDocument();
  });

  it("'Preparar renovação' pre-fills the existing cycle form and never says '+1 mês'", async () => {
    mockApi();
    const { desktop, container } = await renderLoaded("Ana Vencendo");
    const row = within(desktop).getByText("Ana Vencendo").closest("tr") as HTMLElement;
    const link = within(row).getByRole("link", { name: "Preparar renovação" });
    const href = link.getAttribute("href") ?? "";
    expect(href).toContain("/app/cycles/new?");
    expect(href).toContain("clientId=cl1");
    expect(href).toContain("serviceId=sv1");
    expect(href).toContain("templateId=tpl1");
    expect(href).toContain("returnTo=%2Fapp%2Fcycles");
    expect(container.textContent).not.toMatch(/\+1 m[êe]s/i);
  });

  it("routes 'Preparar renovação' to the real request queue when the RenewalCase says the client already asked through the portal", async () => {
    mockApi({
      "/api/v1/renewal-cases?scope=all": [{ ...NEARING_CASE, portal_requested: true }],
    });
    const { desktop } = await renderLoaded("Ana Vencendo");
    const row = within(desktop).getByText("Ana Vencendo").closest("tr") as HTMLElement;
    expect(within(row).getByRole("link", { name: "Preparar renovação" })).toHaveAttribute(
      "href",
      "/app/renewals",
    );
  });

  it("never offers renewal once the RenewalCase says it's already renewed, regardless of what other cycles exist", async () => {
    mockApi({
      "/api/v1/renewal-cases?scope=all": [
        { ...NEARING_CASE, display_status: "renewed", successor_cycle_id: "cy-succ" },
      ],
    });
    const { container } = render(<CyclesPage />);
    // With the case resolved there is no alert left, so the attention view is
    // empty and neither the table nor the renewal action is rendered at all.
    await screen.findByText("Nenhum ciclo exigindo atenção");
    expect(container.querySelector(".hidden.lg\\:block")).toBeNull();
    expect(screen.queryByRole("link", { name: "Preparar renovação" })).not.toBeInTheDocument();
  });

  it("never offers renewal once the RenewalCase says it ended without renewal", async () => {
    mockApi({
      "/api/v1/renewal-cases?scope=all": [{ ...NEARING_CASE, display_status: "ended_without_renewal" }],
    });
    const { container } = render(<CyclesPage />);
    await screen.findByText("Nenhum ciclo exigindo atenção");
    expect(container.querySelector(".hidden.lg\\:block")).toBeNull();
    expect(screen.queryByRole("link", { name: "Preparar renovação" })).not.toBeInTheDocument();
  });

  it("renders a mobile digest instead of the desktop table", async () => {
    mockApi();
    const { mobile } = await renderLoaded("Ana Vencendo");
    expect(within(mobile).getByText("Ana Vencendo")).toBeInTheDocument();
    expect(within(mobile).queryByRole("table")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Perguntar ao Assistente sobre estes ciclos/i }),
    ).toHaveAttribute("href", expect.stringContaining("/app/assistant?"));
  });
});
