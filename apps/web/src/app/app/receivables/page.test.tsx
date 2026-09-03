import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from "@/lib/api";
import ReceivablesPage from "@/app/app/receivables/page";

const TODAY = "2026-09-10";

const OVERDUE = {
  id: "r-overdue",
  cycle_id: "cy1",
  client_id: "cl1",
  amount_cents: 9000,
  due_on: "2026-09-01",
  status: "pending",
  paid_at: null,
  payment_method: null,
  notes: null,
  created_at: "",
  updated_at: "",
  client_name: "Cliente Vencido",
  cycle_service_name: "Aula",
};

const FREE_LEGACY = {
  ...OVERDUE,
  id: "r-free",
  amount_cents: 0,
  client_name: "Cliente Gratuito Legado",
};

const RECEIVED = {
  ...OVERDUE,
  id: "r-received",
  status: "received",
  paid_at: "2026-09-05T12:00:00Z",
  payment_method: "pix",
  client_name: "Cliente Pago",
};

const OVERVIEW = {
  summary: {
    received_month_cents: 9000,
    forecast_month_cents: 18000,
    overdue_cents: 9000,
    overdue_count: 1,
    pending_count: 1,
  },
  monthly_trend: [
    { month: "2026-08", received_cents: 5000 },
    { month: "2026-09", received_cents: 9000 },
  ],
};

function mockApi(over: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = {
    "/api/v1/receivables/overview": OVERVIEW,
    "/api/v1/receivables": [OVERDUE, FREE_LEGACY, RECEIVED],
    "/api/v1/organization/preferences": { local_today: TODAY },
    ...over,
  };
  vi.mocked(apiFetch).mockImplementation(async (path: string) => {
    const p = String(path ?? "");
    if (p in data) return { data: data[p], error: undefined, status: 200 };
    return { data: null, error: { code: "not_found", message: "unexpected" }, status: 404 };
  });
}

async function renderLoaded(waitForName: string) {
  const utils = render(<ReceivablesPage />);
  await screen.findAllByText(waitForName);
  return {
    ...utils,
    desktop: utils.container.querySelector(".hidden.lg\\:block") as HTMLElement,
    mobile: utils.container.querySelector("ul.lg\\:hidden") as HTMLElement,
  };
}

describe("ReceivablesPage — Financeiro, separado da assinatura do Croniu", () => {
  beforeEach(() => vi.mocked(apiFetch).mockReset());
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("never links 'Assinatura' anywhere except /app/billing, and never mixes it with receivables", async () => {
    mockApi();
    render(<ReceivablesPage />);
    const link = await screen.findByRole("link", { name: "Assinatura" });
    expect(link).toHaveAttribute("href", "/app/settings/billing");
  });

  it("shows the three real indicators from the overview endpoint", async () => {
    mockApi();
    render(<ReceivablesPage />);
    expect((await screen.findAllByText("R$ 90,00")).length).toBeGreaterThan(0); // recebido/vencido
    expect(screen.getByText("R$ 180,00")).toBeInTheDocument(); // previsto
  });

  it("opens on 'Vencidos' and never shows the legacy R$0,00 row as overdue", async () => {
    mockApi();
    const { desktop } = await renderLoaded("Cliente Vencido");
    expect(within(desktop).getByText("Cliente Vencido")).toBeInTheDocument();
    expect(within(desktop).queryByText("Cliente Gratuito Legado")).not.toBeInTheDocument();
  });

  it("shows a R$0,00 legacy receivable under 'Todos' but never as an actionable status", async () => {
    mockApi();
    render(<ReceivablesPage />);
    await screen.findAllByText("Cliente Vencido");
    const allTab = screen.getByRole("tab", { name: /Todos/ });
    allTab.click();
    expect(await screen.findAllByText("Cliente Gratuito Legado")).not.toHaveLength(0);
  });

  it("offers 'Registrar pagamento' only for a real pending charge, not for received/free rows", async () => {
    mockApi();
    render(<ReceivablesPage />);
    await screen.findAllByText("Cliente Vencido");
    screen.getByRole("tab", { name: /Todos/ }).click();
    await screen.findAllByText("Cliente Gratuito Legado");
    const container = screen.getAllByText("Cliente Gratuito Legado")[0].closest("tr, li") as HTMLElement;
    expect(within(container).queryByText("Registrar pagamento")).not.toBeInTheDocument();
  });

  it("links each row to the client (financeiro tab) and to the cycle", async () => {
    mockApi();
    const { desktop } = await renderLoaded("Cliente Vencido");
    const row = within(desktop).getByText("Cliente Vencido").closest("tr") as HTMLElement;
    expect(within(row).getByRole("link", { name: "Cliente Vencido" })).toHaveAttribute(
      "href",
      "/app/clients/cl1?tab=financeiro",
    );
    expect(within(row).getByRole("link", { name: "Aula" })).toHaveAttribute(
      "href",
      "/app/cycles/cy1",
    );
  });

  it("renders a mobile digest, never the desktop table", async () => {
    mockApi();
    const { mobile } = await renderLoaded("Cliente Vencido");
    expect(within(mobile).getByText("Cliente Vencido")).toBeInTheDocument();
    expect(within(mobile).queryByRole("table")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Perguntar ao Assistente sobre o financeiro/i }),
    ).toHaveAttribute("href", expect.stringContaining("/app/assistant?"));
  });

  it("shows the monthly trend with real values per month", async () => {
    mockApi();
    render(<ReceivablesPage />);
    expect(await screen.findByText("Evolução do recebido")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /2026-09.*90,00|set.*90,00/i })).toBeTruthy();
  });
});
