import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    apiFetch: vi.fn(),
  };
});

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    me: { organization: { timezone: "America/Sao_Paulo" } },
  }),
}));

import { apiFetch } from "@/lib/api";
import AccompanimentPage from "@/app/app/accompaniment/page";

const PENDING = [
  {
    client_id: "c1",
    client_name: "Ana Nunca Avaliada",
    cycle_id: "cy1",
    service_name: "Treino Funcional",
    last_evaluation_at: null,
    days_since_last_evaluation: null,
    next_appointment_at: "2026-08-20T14:00:00Z",
  },
  {
    client_id: "c2",
    client_name: "Bruno Atrasado",
    cycle_id: "cy2",
    service_name: "Pilates",
    last_evaluation_at: "2026-07-01T10:00:00Z",
    days_since_last_evaluation: 44,
    next_appointment_at: null,
  },
];

const RECENT = [
  {
    id: "ev1",
    client_id: "c3",
    title: "Evolução de Carla",
    published_at: "2026-08-10T12:00:00Z",
    created_at: "2026-08-10T12:00:00Z",
    status: "published",
  },
];

function mockApi() {
  vi.mocked(apiFetch).mockImplementation(async (path: string) => {
    const p = String(path ?? "");
    if (p.includes("/accompaniment/pending")) {
      return { data: { days_threshold: 15, items: PENDING }, error: undefined, status: 200 };
    }
    if (p.includes("/evaluations/recent")) {
      return { data: RECENT, error: undefined, status: 200 };
    }
    return { data: null, error: { code: "not_found", message: "unexpected" }, status: 404 };
  });
}

describe("AccompanimentPage desktop — Pendentes vs Histórico, listas densas", () => {
  beforeEach(() => vi.mocked(apiFetch).mockReset());
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders inside the hidden lg:block tree with real pending clients, never invented data", async () => {
    mockApi();
    const { container } = render(<AccompanimentPage />);
    const desktop = container.querySelector(".hidden.lg\\:block") as HTMLElement;
    await within(desktop).findByText("Ana Nunca Avaliada");
    expect(within(desktop).getByText("Bruno Atrasado")).toBeInTheDocument();
    expect(within(desktop).getByText("Nunca avaliado")).toBeInTheDocument();
    expect(within(desktop).getByText("44 dias")).toBeInTheDocument();
  });

  it("shows real service/cycle name per row, not a placeholder", async () => {
    mockApi();
    const { container } = render(<AccompanimentPage />);
    const desktop = container.querySelector(".hidden.lg\\:block") as HTMLElement;
    await within(desktop).findByText("Treino Funcional");
    expect(within(desktop).getByText("Pilates")).toBeInTheDocument();
  });

  it("offers a real 'Registrar avaliação' link into the evaluations flow with returnTo", async () => {
    mockApi();
    const { container } = render(<AccompanimentPage />);
    const desktop = container.querySelector(".hidden.lg\\:block") as HTMLElement;
    await within(desktop).findByText("Ana Nunca Avaliada");
    const row = within(desktop).getByText("Ana Nunca Avaliada").closest("tr") as HTMLElement;
    const link = within(row).getByRole("link", { name: "Registrar avaliação" });
    expect(link).toHaveAttribute(
      "href",
      "/app/clients/c1/evaluations/new?returnTo=%2Fapp%2Faccompaniment",
    );
  });

  it("switches to Histórico and shows real published evaluations with a link to the record", async () => {
    mockApi();
    const { container } = render(<AccompanimentPage />);
    const desktop = container.querySelector(".hidden.lg\\:block") as HTMLElement;
    await within(desktop).findByText("Ana Nunca Avaliada");
    fireEvent.click(within(desktop).getByRole("tab", { name: /Histórico/i }));
    await within(desktop).findByText("Evolução de Carla");
    const link = within(desktop).getByRole("link", { name: "Abrir registro" });
    expect(link).toHaveAttribute("href", "/app/clients/c3/evaluations/ev1");
  });

  it("re-fetches pending with the selected days_threshold", async () => {
    mockApi();
    const { container } = render(<AccompanimentPage />);
    const desktop = container.querySelector(".hidden.lg\\:block") as HTMLElement;
    await within(desktop).findByText("Ana Nunca Avaliada");
    fireEvent.change(within(desktop).getByLabelText("Período sem avaliação"), {
      target: { value: "30" },
    });
    await new Promise((r) => setTimeout(r, 0));
    const calls = vi.mocked(apiFetch).mock.calls.map(([path]) => String(path));
    expect(calls.some((p) => p.includes("days_threshold=30"))).toBe(true);
  });
});

describe("AccompanimentPage mobile — resumo, nunca a tabela densa", () => {
  beforeEach(() => vi.mocked(apiFetch).mockReset());
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders inside a lg:hidden tree with real pending clients and quick actions", async () => {
    mockApi();
    const { container } = render(<AccompanimentPage />);
    const mobile = container.querySelector(".lg\\:hidden") as HTMLElement;
    await within(mobile).findByText("Ana Nunca Avaliada");
    const card = within(mobile).getByText("Ana Nunca Avaliada").closest("li") as HTMLElement;
    expect(within(card).getByRole("link", { name: /Registrar avaliação/i })).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: /Abrir cliente/i })).toHaveAttribute(
      "href",
      "/app/clients/c1",
    );
  });
});

describe("AccompanimentPage — empty state, never a bare notes collection", () => {
  beforeEach(() => vi.mocked(apiFetch).mockReset());
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows a real empty state when nobody is pending", async () => {
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      const p = String(path ?? "");
      if (p.includes("/accompaniment/pending"))
        return { data: { days_threshold: 15, items: [] }, error: undefined, status: 200 };
      if (p.includes("/evaluations/recent")) return { data: [], error: undefined, status: 200 };
      return { data: null, error: { code: "not_found", message: "unexpected" }, status: 404 };
    });
    const { container } = render(<AccompanimentPage />);
    const desktop = container.querySelector(".hidden.lg\\:block") as HTMLElement;
    expect(await within(desktop).findByText("Nenhuma avaliação pendente.")).toBeInTheDocument();
  });
});

describe("AccompanimentPage — gate correction (2026-09-02): avaliação vs acompanhamento", () => {
  beforeEach(() => vi.mocked(apiFetch).mockReset());
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("labels the pending tab as avaliação pendente, never as a generic acompanhamento pendency", async () => {
    mockApi();
    const { container } = render(<AccompanimentPage />);
    const desktop = container.querySelector(".hidden.lg\\:block") as HTMLElement;
    await within(desktop).findByText("Ana Nunca Avaliada");
    expect(
      within(desktop).getByRole("tab", { name: /Avaliações pendentes/i }),
    ).toBeInTheDocument();
  });

  it("never asserts a pendência of 'acompanhamento' anywhere on the page — the product has no such log yet", async () => {
    mockApi();
    const { container } = render(<AccompanimentPage />);
    const desktop = container.querySelector(".hidden.lg\\:block") as HTMLElement;
    await within(desktop).findByText("Ana Nunca Avaliada");
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/acompanhamento pendente/i);
    expect(text).not.toMatch(/sem acompanhamento/i);
  });

  it("shows the never-evaluated badge as 'Nunca avaliado', not 'Nunca acompanhado'", async () => {
    mockApi();
    const { container } = render(<AccompanimentPage />);
    const desktop = container.querySelector(".hidden.lg\\:block") as HTMLElement;
    await within(desktop).findByText("Nunca avaliado");
    expect(within(desktop).queryByText("Nunca acompanhado")).not.toBeInTheDocument();
  });
});
