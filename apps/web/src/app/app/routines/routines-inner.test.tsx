import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  professionCode: "personal_trainer" as string | null,
  useCases: ["workouts"] as string[] | null,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

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
