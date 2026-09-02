import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AgentChatResponse } from "@/components/app/assistant/types";

let chatResponse: { data?: AgentChatResponse; error?: { message: string; code?: string } } = {
  data: { reply: "Você tem 2 compromissos hoje.", status: "ok" },
};

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    apiFetch: vi.fn(async (path: string) => {
      if (path === "/api/v1/agent/chat") return chatResponse;
      if (path.includes("/agent/pending/") && path.endsWith("/confirm")) {
        return {
          data: {
            reply: "Compromisso cancelado.",
            status: "ok",
            action_status: "executed",
          } satisfies AgentChatResponse,
        };
      }
      if (path.includes("/agent/pending/") && path.endsWith("/cancel")) {
        return { data: { reply: "Ação cancelada.", status: "ok" } satisfies AgentChatResponse };
      }
      return { data: null };
    }),
  };
});

import { CommandPalette } from "@/components/app/command-palette";

function ctrlK() {
  fireEvent.keyDown(document, { key: "k", ctrlKey: true });
}

describe("CommandPalette (Ctrl+K) — quick query, distinct from the full Assistente page", () => {
  it("is closed by default and opens on Ctrl+K", () => {
    render(<CommandPalette />);
    expect(screen.queryByRole("dialog", { name: /Consulta rápida/i })).not.toBeInTheDocument();
    ctrlK();
    expect(screen.getByRole("dialog", { name: /Consulta rápida/i })).toBeInTheDocument();
  });

  it("closes again on a second Ctrl+K and on Escape", () => {
    render(<CommandPalette />);
    ctrlK();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    ctrlK();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    ctrlK();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("explains itself as quick-only and links out to the full Assistente page for history/conversation", () => {
    render(<CommandPalette />);
    ctrlK();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/para conversa completa e histórico, abra a página/i)).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: /Abrir Assistente completo/i })).toHaveAttribute(
      "href",
      "/app/assistant",
    );
  });

  it("sends a quick query through /agent/chat (the stateless convenience endpoint, not a managed thread) and shows the real reply", async () => {
    chatResponse = { data: { reply: "Você tem 2 compromissos hoje.", status: "ok" } };
    render(<CommandPalette />);
    ctrlK();
    const input = screen.getByLabelText("Consulta rápida");
    fireEvent.change(input, { target: { value: "O que tenho hoje?" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(await screen.findByText("Você tem 2 compromissos hoje.")).toBeInTheDocument();
  });

  it("renders a real ProposalCard for a write action and confirms it through the real confirm endpoint", async () => {
    chatResponse = {
      data: {
        reply: "Posso cancelar o compromisso das 14h?",
        status: "awaiting_confirmation",
        pending_action: {
          id: "pend-1",
          tool_name: "propose_cancel_appointment",
          summary: "Cancelar compromisso de Ana: hoje às 14h.",
          arguments: { appointment_id: "appt-1" },
          expires_at: new Date(Date.now() + 600_000).toISOString(),
          status: "pending",
        },
      },
    };
    render(<CommandPalette />);
    ctrlK();
    const input = screen.getByLabelText("Consulta rápida");
    fireEvent.change(input, { target: { value: "Cancele o compromisso das 14h" } });
    fireEvent.keyDown(input, { key: "Enter" });
    const confirmBtn = await screen.findByRole("button", { name: "Confirmar" });
    fireEvent.click(confirmBtn);
    expect(await screen.findByText("Compromisso cancelado.")).toBeInTheDocument();
  });

  it("shows the error message inline when the chat call fails (e.g. rate limit) without crashing", async () => {
    chatResponse = { error: { message: "Limite de uso atingido. Tente novamente mais tarde." } };
    render(<CommandPalette />);
    ctrlK();
    const input = screen.getByLabelText("Consulta rápida");
    fireEvent.change(input, { target: { value: "Meu dia" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(await screen.findByRole("alert")).toHaveTextContent(/Limite de uso atingido/i);
  });
});
