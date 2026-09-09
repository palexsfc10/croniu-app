import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/app/back-link", () => ({
  BackLink: () => <a href="/app/settings">Conta e configurações</a>,
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    me: { organization: { name: "Studio Ana" } },
    refresh: vi.fn(async () => {}),
  }),
}));

const apiFetch = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    apiFetch: (...args: unknown[]) => apiFetch(...args),
  };
});

import WorkspacePage from "@/app/app/settings/workspace/page";

function mockGets() {
  apiFetch.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === "/api/v1/organization/profession" && !init) {
      return { data: { profession_code: null, profession_specialty: null, profession_other: null, use_cases: [] }, status: 200 };
    }
    if (path === "/api/v1/organization/preferences" && !init) {
      return { data: { timezone: "America/Sao_Paulo", local_today: "2026-09-03" }, status: 200 };
    }
    if (path === "/api/v1/availability/settings" && !init) {
      return { data: { configured: false, days: [] }, status: 200 };
    }
    if (path === "/api/v1/organization/payment-settings" && !init) {
      return { data: { show_on_my_cycle: true, institution: null }, status: 200 };
    }
    if (init?.method === "PATCH" && path === "/api/v1/organization/profession") {
      return { data: { profession_code: "sports_teacher", use_cases: [] }, status: 200 };
    }
    if (init?.method === "PATCH" && path === "/api/v1/organization/preferences") {
      return { data: { timezone: "America/Manaus", local_today: "2026-09-03" }, status: 200 };
    }
    if (init?.method === "PUT" && path === "/api/v1/availability/settings") {
      return { data: { configured: true, days: [] }, status: 200 };
    }
    if (init?.method === "PUT" && path === "/api/v1/organization/payment-settings") {
      return { data: { show_on_my_cycle: true, institution: null, holder_name: "Ana" }, status: 200 };
    }
    return { data: null, status: 404 };
  });
}

describe("Workspace settings — negócio separado de conta e assinatura", () => {
  beforeEach(() => mockGets());
  afterEach(() => {
    cleanup();
    apiFetch.mockReset();
  });

  it("shows the organization name and all 4 grouped sections, never account or billing data", async () => {
    render(<WorkspacePage />);
    expect(await screen.findByText("Studio Ana")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Perfil profissional" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Fuso horário" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Jornada e disponibilidade" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Recebimentos" })).toBeInTheDocument();
    // The page mentions "assinatura do Croniu" only to explicitly distinguish
    // it from Recebimentos — it must never render a real billing UI here.
    expect(screen.queryByRole("button", { name: /Assinar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /assinatura/i })).not.toBeInTheDocument();
  });

  it("saves the profession section independently of the other sections", async () => {
    render(<WorkspacePage />);
    await screen.findByText("Studio Ana");
    const select = screen.getByLabelText(/área de atuação/i);
    fireEvent.change(select, { target: { value: "sports_teacher" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar perfil profissional" }));
    await screen.findByText(/Perfil profissional atualizado/i);
    const [, patchInit] = apiFetch.mock.calls.find(
      (c) => c[0] === "/api/v1/organization/profession" && c[1]?.method === "PATCH",
    )!;
    expect(JSON.parse(patchInit.body).profession_code).toBe("sports_teacher");
  });

  it("saves the timezone section without touching availability or receiving settings", async () => {
    render(<WorkspacePage />);
    await screen.findByText("Studio Ana");
    fireEvent.click(screen.getByRole("button", { name: "Salvar fuso" }));
    await screen.findByText("Fuso salvo.");
    const patchCalls = apiFetch.mock.calls.filter((c) => c[1]?.method === "PATCH");
    expect(patchCalls).toHaveLength(1);
    expect(patchCalls[0][0]).toBe("/api/v1/organization/preferences");
  });

  it("saves the full availability week", async () => {
    render(<WorkspacePage />);
    await screen.findByText("Studio Ana");
    fireEvent.click(screen.getByRole("button", { name: /Salvar horários/i }));
    await screen.findByText("Horários salvos.");
    const putCall = apiFetch.mock.calls.find(
      (c) => c[0] === "/api/v1/availability/settings" && c[1]?.method === "PUT",
    )!;
    expect(JSON.parse(putCall[1].body).days).toHaveLength(7);
    expect(screen.getByText("Configurado")).toBeInTheDocument();
  });

  it("saves receiving settings (Recebimentos) separately, never mixed with Croniu billing", async () => {
    render(<WorkspacePage />);
    await screen.findByText("Studio Ana");
    const recebimentos = screen.getByRole("heading", { name: "Recebimentos" }).closest("section")!;
    fireEvent.change(within(recebimentos).getByLabelText("Nome do titular"), {
      target: { value: "Ana" },
    });
    fireEvent.click(within(recebimentos).getByRole("button", { name: "Salvar recebimentos" }));
    await within(recebimentos).findByText("Recebimentos salvos.");
    const putCall = apiFetch.mock.calls.find(
      (c) => c[0] === "/api/v1/organization/payment-settings" && c[1]?.method === "PUT",
    )!;
    expect(JSON.parse(putCall[1].body).holder_name).toBe("Ana");
    expect(apiFetch.mock.calls.some((c) => String(c[0]).includes("/billing/"))).toBe(false);
  });
});
