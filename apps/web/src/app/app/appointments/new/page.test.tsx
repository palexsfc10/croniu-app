import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ query: "", replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.query),
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ me: { organization: { timezone: "America/Sao_Paulo" } } }),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    apiFetch: vi.fn(async (path: string) => {
      if (path.includes("/clients")) {
        return {
          data: [
            { id: "c1", full_name: "Ana Martins", status: "active" },
            { id: "c2", full_name: "Diego Farias", status: "active" },
          ],
        };
      }
      if (path.includes("/locations")) return { data: [] };
      return { data: null };
    }),
  };
});

import NewAppointmentPage from "@/app/app/appointments/new/page";

describe("Novo compromisso — preselect a partir do Cliente 360°", () => {
  beforeEach(() => {
    nav.query = "";
    nav.replace.mockClear();
  });

  it("keeps the client dropdown empty by default (no clientId in the URL)", async () => {
    render(<NewAppointmentPage />);
    const select = (await screen.findByLabelText("Cliente")) as HTMLSelectElement;
    expect(select.value).toBe("");
  });

  it("preselects the client when clientId is present in the URL", async () => {
    nav.query = "clientId=c2";
    render(<NewAppointmentPage />);
    const select = (await screen.findByLabelText("Cliente")) as HTMLSelectElement;
    expect(select.value).toBe("c2");
  });
});
