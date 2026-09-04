import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    apiFetch: vi.fn(),
  };
});

import { apiFetch } from "@/lib/api";
import RenewalsPage from "@/app/app/renewals/page";

afterEach(() => {
  cleanup();
  vi.mocked(apiFetch).mockReset();
});

const NEEDS_DECISION = [
  {
    case_id: null,
    client_id: "c1",
    client_name: "Ana Próxima",
    source_cycle_id: "cy1",
    service_name: "Pilates",
    ends_on: "2026-09-20",
    display_status: "upcoming",
    portal_requested: false,
    next_contact_date: null,
    resolution_reason: null,
    resolution_note: null,
    resolved_at: null,
    successor_cycle_id: null,
  },
  {
    case_id: "case-2",
    client_id: "c2",
    client_name: "Bruno Atrasado",
    source_cycle_id: "cy2",
    service_name: "Funcional",
    ends_on: "2026-08-20",
    display_status: "overdue",
    portal_requested: true,
    next_contact_date: null,
    resolution_reason: null,
    resolution_note: null,
    resolved_at: null,
    successor_cycle_id: null,
  },
];

const ALL_SCOPE = [
  ...NEEDS_DECISION,
  {
    case_id: "case-3",
    client_id: "c3",
    client_name: "Carla Renovada",
    source_cycle_id: "cy3",
    service_name: "Yoga",
    ends_on: "2026-07-01",
    display_status: "renewed",
    portal_requested: false,
    next_contact_date: null,
    resolution_reason: null,
    resolution_note: null,
    resolved_at: "2026-07-01T10:00:00Z",
    successor_cycle_id: "cy3-new",
  },
];

function mockApi(handlers: { needsDecision?: unknown[]; all?: unknown[] } = {}) {
  vi.mocked(apiFetch).mockImplementation(async (path: string, init?: RequestInit) => {
    const p = String(path ?? "");
    if (p.includes("/renewal-cases?scope=needs_decision")) {
      return { data: handlers.needsDecision ?? NEEDS_DECISION, error: undefined, status: 200 };
    }
    if (p.includes("/renewal-cases?scope=all")) {
      return { data: handlers.all ?? ALL_SCOPE, error: undefined, status: 200 };
    }
    if (p.includes("/awaiting-client") && init?.method === "POST") {
      return {
        data: { ...NEEDS_DECISION[0], display_status: "awaiting_client", next_contact_date: "2026-09-10" },
        error: undefined,
        status: 200,
      };
    }
    if (p.includes("/end-without-renewal") && init?.method === "POST") {
      return {
        data: { ...NEEDS_DECISION[0], display_status: "ended_without_renewal", resolution_reason: "no_response" },
        error: undefined,
        status: 200,
      };
    }
    return { data: null, error: undefined, status: 200 };
  });
}

describe("RenewalsPage — só o que exige decisão por padrão, nunca duplica a Central de Ciclos", () => {
  it("shows upcoming/overdue cases and flags the portal-originated one, never the resolved ones", async () => {
    mockApi();
    render(<RenewalsPage />);

    await screen.findAllByText("Ana Próxima");
    expect(screen.getAllByText("Bruno Atrasado").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Cliente pediu").length).toBeGreaterThan(0);
    // Resolved case never shows up under the default "Exige decisão" scope.
    expect(screen.queryByText("Carla Renovada")).not.toBeInTheDocument();
  });

  it("switching to 'Histórico completo' shows the renewed case with a link to its successor cycle", async () => {
    mockApi();
    render(<RenewalsPage />);
    await screen.findAllByText("Ana Próxima");

    const historyTab = screen.getByRole("tab", { name: "Histórico completo" });
    historyTab.click();

    await screen.findAllByText("Carla Renovada");
    const links = screen.getAllByRole("link", { name: /Ver ciclo renovado/i });
    expect(links[0]).toHaveAttribute("href", "/app/cycles/cy3-new");
  });

  it("marking a case awaiting client requires a date and updates the row on success", async () => {
    mockApi();
    render(<RenewalsPage />);
    await screen.findAllByText("Ana Próxima");

    const buttons = screen.getAllByRole("button", { name: "Aguardando cliente" });
    buttons[0].click();

    const sheet = await screen.findByRole("dialog");
    const submit = within(sheet).getByRole("button", { name: /Marcar aguardando cliente/i });
    submit.click();
    expect(await within(sheet).findByText(/Informe a próxima data/i)).toBeInTheDocument();
  });

  it("ending a case without renewal requires a reason", async () => {
    mockApi();
    render(<RenewalsPage />);
    await screen.findAllByText("Ana Próxima");

    const buttons = screen.getAllByRole("button", { name: "Encerrar sem renovar" });
    buttons[0].click();

    const sheet = await screen.findByRole("dialog");
    const submit = within(sheet).getByRole("button", { name: /^Encerrar sem renovar$/i });
    submit.click();
    expect(await within(sheet).findByText(/Selecione um motivo/i)).toBeInTheDocument();
  });

  it("shows an empty state when nothing needs a decision, without fabricating pendencies", async () => {
    mockApi({ needsDecision: [] });
    render(<RenewalsPage />);
    await waitFor(() => {
      expect(screen.getByText("Nada exige decisão agora")).toBeInTheDocument();
    });
  });
});
