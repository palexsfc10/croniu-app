import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssistantHeader } from "@/components/app/assistant/assistant-header";
import type { AssistantConversation } from "@/components/app/assistant/use-assistant-conversation";

function mockConversation(): AssistantConversation {
  return {
    threadsTriggerRef: { current: null },
    threadsPanelRef: { current: null },
    threads: [],
    threadId: null,
    threadsOpen: false,
    setThreadsOpen: vi.fn(),
    setMicMenuOpen: vi.fn(),
    startNewThread: vi.fn(),
    openThread: vi.fn(),
  } as unknown as AssistantConversation;
}

describe("AssistantHeader — Cronia / Histórico / Nova conversa, minimize+close never both on mobile", () => {
  afterEach(() => cleanup());

  it("panel (desktop docked layer) offers both Minimizar and Fechar", () => {
    render(
      <AssistantHeader layout="panel" conversation={mockConversation()} onMinimize={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Minimizar Cronia" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fechar Cronia" })).toBeInTheDocument();
  });

  it("overlay (mobile full-screen) offers only Fechar — no docked mini-state to minimize into", () => {
    render(
      <AssistantHeader layout="overlay" conversation={mockConversation()} onMinimize={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.queryByRole("button", { name: "Minimizar Cronia" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fechar Cronia" })).toBeInTheDocument();
  });

  it("page (full screen route) offers neither — it navigates back instead", () => {
    render(<AssistantHeader layout="page" conversation={mockConversation()} />);
    expect(screen.queryByRole("button", { name: "Minimizar Cronia" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Fechar Cronia" })).not.toBeInTheDocument();
  });

  it("always shows Cronia, the Histórico trigger and Nova conversa", () => {
    render(<AssistantHeader layout="overlay" conversation={mockConversation()} onClose={vi.fn()} />);
    expect(screen.getByText("Cronia")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Conversas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nova conversa" })).toBeInTheDocument();
  });
});
