import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn();

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

import AssistantPage from "@/app/app/assistant/page";

describe("AssistantPage confirmation UX", () => {
  afterEach(() => {
    cleanup();
    apiFetch.mockReset();
  });

  it("renders suggestions and confirmation-ready shell", async () => {
    apiFetch.mockImplementation(async (path: string) => {
      if (path.includes("/agent/status")) {
        return {
          data: {
            enabled: true,
            provider: "fake",
            model: "fake",
            tools: ["get_today_summary"],
            entitlement_ok: true,
          },
        };
      }
      if (path.endsWith("/agent/threads") && !path.includes("messages")) {
        return { data: { items: [] } };
      }
      return { data: null };
    });
    render(<AssistantPage />);
    expect(await screen.findByRole("heading", { name: "Assistente" })).toBeInTheDocument();
    expect(screen.getByText(/Resuma meu dia/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Pergunte ou peça algo ao Croniu/i)).toBeInTheDocument();
  });

  it("locks confirm buttons and shows single actionable error without duplicate bubbles", async () => {
    const pending = {
      id: "11111111-1111-1111-1111-111111111111",
      tool_name: "create_client",
      risk_class: "write_common",
      summary: "Criar cliente “Jose”.",
      summary_fields: { Cliente: "Jose" },
      arguments: { full_name: "Jose", phone: null, email: "a@b.com", notes: null },
      expires_at: new Date(Date.now() + 600_000).toISOString(),
      status: "pending",
    };

    apiFetch.mockImplementation(async (path: string, init?: RequestInit) => {
      if (String(path).includes("/agent/status")) {
        return {
          status: 200,
          data: {
            enabled: true,
            provider: "fake",
            model: "fake",
            tools: [],
            entitlement_ok: true,
          },
        };
      }
      if (String(path).endsWith("/agent/threads") && init?.method === "POST") {
        return {
          status: 201,
          data: {
            id: "22222222-2222-2222-2222-222222222222",
            title: null,
            status: "active",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        };
      }
      if (String(path).includes("/agent/threads") && !String(path).includes("messages") && !init?.method) {
        return { status: 200, data: { items: [] } };
      }
      if (String(path).includes("/messages")) {
        return {
          status: 200,
          data: {
            reply: "Preciso da sua confirmação.",
            status: "awaiting_confirmation",
            pending_action: pending,
          },
        };
      }
      if (String(path).includes("/confirm")) {
        return {
          status: 409,
          error: {
            code: "client_email_exists",
            message: "Já existe um cliente com este e-mail nesta organização.",
            details: { action_status: "failed", pending_action_id: pending.id },
          },
        };
      }
      return { status: 200, data: null };
    });

    render(<AssistantPage />);
    const input = await screen.findByLabelText(/Pergunte ou peça algo ao Croniu/i);
    await waitFor(() => expect(input).not.toBeDisabled());
    fireEvent.change(input, { target: { value: "Cadastre um cliente" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Enviar" })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    expect(await screen.findByText(/Criar cliente/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
  });
});
