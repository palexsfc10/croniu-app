import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useParams: () => ({ clientId: "c1" }),
  useRouter: () => ({ replace: nav.replace, refresh: nav.refresh }),
}));

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: fetchMock };
});

import EditClientPage from "@/app/app/clients/[clientId]/edit/page";

describe("Editar cliente — usa o PATCH real já existente", () => {
  beforeEach(() => {
    nav.replace.mockClear();
    nav.refresh.mockClear();
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (path: string, init?: RequestInit) => {
      if (!init && path === "/api/v1/clients/c1") {
        return {
          data: {
            id: "c1",
            full_name: "Pedro Silva",
            phone: "11987654321",
            email: "pedro@example.com",
            notes: "Prefere manhã",
            status: "active",
          },
        };
      }
      if (init?.method === "PATCH") {
        return { data: { id: "c1", full_name: "Pedro S. Silva" } };
      }
      return { data: null };
    });
  });

  it("preenche o formulário com os dados atuais do cliente", async () => {
    render(<EditClientPage />);
    expect(await screen.findByDisplayValue("Pedro Silva")).toBeInTheDocument();
    expect(screen.getByDisplayValue("11987654321")).toBeInTheDocument();
    expect(screen.getByDisplayValue("pedro@example.com")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Prefere manhã")).toBeInTheDocument();
  });

  it("envia PATCH com os campos editados e volta para o 360°", async () => {
    const user = userEvent.setup();
    render(<EditClientPage />);
    const nameField = await screen.findByDisplayValue("Pedro Silva");
    await user.clear(nameField);
    await user.type(nameField, "Pedro S. Silva");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await vi.waitFor(() => expect(nav.replace).toHaveBeenCalled());
    const patchCall = fetchMock.mock.calls.find(
      (call: unknown[]) => (call[1] as RequestInit | undefined)?.method === "PATCH",
    );
    expect(patchCall).toBeTruthy();
    expect(patchCall![0]).toBe("/api/v1/clients/c1");
    const patchInit = patchCall![1] as RequestInit;
    expect(JSON.parse(patchInit.body as string)).toMatchObject({
      full_name: "Pedro S. Silva",
    });
    expect(nav.replace).toHaveBeenCalledWith("/app/clients/c1");
  });
});
