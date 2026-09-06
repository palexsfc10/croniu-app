import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from "@/lib/api";
import ServicesPage from "@/app/app/services/page";

const PER_LESSON = {
  id: "sv1",
  name: "Aula Avulsa",
  description: null,
  default_duration_days: 30,
  default_duration_minutes: 60,
  default_price_cents: 9000,
  pricing_mode: "per_lesson",
  fixed_price_cents: null,
  status: "active",
  created_at: "",
  updated_at: "",
};

const FIXED = {
  ...PER_LESSON,
  id: "sv2",
  name: "Plano Mensal",
  pricing_mode: "fixed_period",
  default_price_cents: null,
  fixed_price_cents: 30000,
};

function mockApi(over: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = {
    "/api/v1/services?status=active": [PER_LESSON, FIXED],
    "/api/v1/services/usage": [
      { service_id: "sv1", running_cycles: 3, total_cycles: 7, distinct_clients: 5 },
    ],
    ...over,
  };
  vi.mocked(apiFetch).mockImplementation(async (path: string) => {
    const p = String(path ?? "");
    if (p in data) return { data: data[p], error: undefined, status: 200 };
    return { data: null, error: { code: "not_found", message: "unexpected" }, status: 404 };
  });
}

async function renderLoaded() {
  const utils = render(<ServicesPage />);
  await screen.findAllByText("Aula Avulsa");
  return {
    ...utils,
    desktop: utils.container.querySelector(".hidden.lg\\:block") as HTMLElement,
    mobile: utils.container.querySelector("ul.lg\\:hidden") as HTMLElement,
  };
}

describe("ServicesPage — catálogo com uso real", () => {
  beforeEach(() => vi.mocked(apiFetch).mockReset());
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("frames services as reusable config and links to the contracts screen", async () => {
    mockApi();
    await renderLoaded();
    expect(screen.getByRole("heading", { name: "Serviços" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ciclos" })).toHaveAttribute("href", "/app/cycles");
  });

  it("names the billing mode in words instead of showing a raw enum", async () => {
    mockApi();
    const { desktop } = await renderLoaded();
    const fixedRow = within(desktop).getByText("Plano Mensal").closest("tr") as HTMLElement;
    expect(within(fixedRow).getByText("Valor fixo")).toBeInTheDocument();
    expect(within(fixedRow).getByText(/300,00/)).toBeInTheDocument();
    const perLessonRow = within(desktop).getByText("Aula Avulsa").closest("tr") as HTMLElement;
    expect(within(perLessonRow).getByText("Por aula")).toBeInTheDocument();
    expect(desktop.textContent).not.toMatch(/per_lesson|fixed_period/);
  });

  it("shows the real usage counters returned by the backend", async () => {
    mockApi();
    const { desktop } = await renderLoaded();
    const row = within(desktop).getByText("Aula Avulsa").closest("tr") as HTMLElement;
    const cells = within(row).getAllByRole("cell").map((c) => c.textContent);
    expect(cells).toContain("3");
    expect(cells).toContain("5");
  });

  it("renders zero — never a blank or invented number — for a service with no cycles", async () => {
    mockApi();
    const { desktop } = await renderLoaded();
    const row = within(desktop).getByText("Plano Mensal").closest("tr") as HTMLElement;
    const cells = within(row).getAllByRole("cell").map((c) => c.textContent);
    // running_cycles and distinct_clients both absent from /usage → 0, 0
    expect(cells.filter((c) => c === "0")).toHaveLength(2);
  });

  it("fetches archived services only when the professional asks for them", async () => {
    mockApi();
    await renderLoaded();
    const calls = vi.mocked(apiFetch).mock.calls.map(([p]) => String(p));
    expect(calls).toContain("/api/v1/services?status=active");
    expect(calls).not.toContain("/api/v1/services?status=archived");
    expect(screen.getByRole("button", { name: "Ver serviços arquivados" })).toBeInTheDocument();
  });

  it("gives mobile cards rather than the desktop table", async () => {
    mockApi();
    const { mobile } = await renderLoaded();
    expect(within(mobile).queryByRole("table")).not.toBeInTheDocument();
    expect(within(mobile).getByText(/3 ciclos em andamento · 5 clientes/)).toBeInTheDocument();
  });
});
