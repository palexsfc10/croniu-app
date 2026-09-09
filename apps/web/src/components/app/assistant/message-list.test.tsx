import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MessageList } from "@/components/app/assistant/message-list";
import type { AssistantConversation } from "@/components/app/assistant/use-assistant-conversation";
import { personalGreeting } from "@/lib/greeting";

function mockConversation(): AssistantConversation {
  return {
    homeSummary: { today_appointments: [{ id: "a1" }], attention_items: [] },
    threads: [{ id: "t1", title: "Conversa antiga" }],
    disabled: false,
    busy: false,
    setInput: vi.fn(),
    send: vi.fn(),
    messages: [],
    recording: false,
    error: null,
    pending: null,
    empty: true,
    scrollToBottom: vi.fn(),
    onTranscriptScroll: vi.fn(),
    showJump: false,
    openThread: vi.fn(),
    confirmPending: vi.fn(),
    cancelPending: vi.fn(),
  } as unknown as AssistantConversation;
}

const greeting = personalGreeting("Pedro", "America/Sao_Paulo");

describe("MessageList empty state — lean on docked surfaces (panel/overlay), full only on the page", () => {
  afterEach(() => cleanup());

  it("showQuickAccess=false (panel/mobile overlay): no shortcuts, no compromissos-hoje, no Consultas recentes, at most 3 suggestions", () => {
    render(
      <MessageList conversation={mockConversation()} greeting={greeting} showQuickAccess={false} />,
    );
    expect(screen.queryByRole("group", { name: "Acesso rápido" })).not.toBeInTheDocument();
    expect(screen.queryByText(/compromisso\(s\) hoje/)).not.toBeInTheDocument();
    expect(screen.queryByText("Consultas recentes")).not.toBeInTheDocument();
    expect(screen.queryByText("Conversa antiga")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Meu dia|Clientes em atenção|Ciclos terminando|Novo compromisso/ })).toHaveLength(3);
  });

  it("showQuickAccess=true (the full page): keeps shortcuts, compromissos hoje, Consultas recentes and all 4 suggestions", () => {
    render(
      <MessageList conversation={mockConversation()} greeting={greeting} showQuickAccess />,
    );
    expect(screen.getByRole("group", { name: "Acesso rápido" })).toBeInTheDocument();
    expect(screen.getByText(/compromisso\(s\) hoje/)).toBeInTheDocument();
    expect(screen.getByText("Consultas recentes")).toBeInTheDocument();
    expect(within(screen.getByText("Consultas recentes").closest("div")!).getByText("Conversa antiga")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Meu dia|Clientes em atenção|Ciclos terminando|Novo compromisso/ })).toHaveLength(4);
  });
});
