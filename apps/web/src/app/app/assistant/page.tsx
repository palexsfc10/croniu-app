"use client";

import { useEffect, useState } from "react";
import { BackLink } from "@/components/app/back-link";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/text-area";
import { apiFetch } from "@/lib/api";

type AgentStatus = {
  enabled: boolean;
  provider: string;
  model: string;
  tools: string[];
};

type PendingAction = {
  id: string;
  tool_name: string;
  summary: string;
  arguments: Record<string, unknown>;
  expires_at: string;
};

type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  pending?: PendingAction | null;
};

type AgentChatResponse = {
  reply: string;
  status: string;
  pending_action?: PendingAction | null;
  tool_trace?: string[];
};

const SUGGESTIONS = [
  "Quais são meus compromissos de hoje?",
  "Quais clientes estão com ciclo terminando?",
  "Quais recebimentos estão pendentes?",
  "Quais avaliações recentes eu publiquei?",
];

export default function AssistantPage() {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await apiFetch<AgentStatus>("/api/v1/agent/status");
      if (cancelled) return;
      if (result.data) setStatus(result.data);
      setStatusLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");
    const result = await apiFetch<AgentChatResponse>("/api/v1/agent/chat", {
      method: "POST",
      body: JSON.stringify({ message: trimmed, input_modality: "text" }),
    });
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: result.error?.message || "Falha ao consultar o assistente.",
        },
      ]);
      return;
    }
    const data = result.data!;
    setPending(data.pending_action ?? null);
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: data.reply,
        pending: data.pending_action,
      },
    ]);
  }

  async function confirmPending() {
    if (!pending) return;
    setBusy(true);
    setError(null);
    const result = await apiFetch<AgentChatResponse>(
      `/api/v1/agent/pending/${pending.id}/confirm`,
      {
        method: "POST",
        body: JSON.stringify({ arguments: pending.arguments }),
      },
    );
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setPending(null);
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: result.data?.reply || "Ação confirmada." },
    ]);
  }

  async function cancelPending() {
    if (!pending) return;
    setBusy(true);
    const result = await apiFetch<AgentChatResponse>(
      `/api/v1/agent/pending/${pending.id}/cancel`,
      { method: "POST", body: "{}" },
    );
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setPending(null);
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: result.data?.reply || "Ação cancelada." },
    ]);
  }

  return (
    <div className="mx-auto flex min-h-[70dvh] w-full max-w-3xl flex-col gap-4 animate-fade-up">
      <BackLink href="/app" label="Hoje" />
      <div className="surface-ai rounded-[var(--radius-lg)] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="h-display text-3xl text-[var(--color-ink)]">Assistente</h1>
          <span className="badge badge-ai">IA</span>
        </div>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Consultas sobre agenda, ciclos, recebimentos e avaliações. Escritas exigem confirmação.
        </p>
      </div>

      {statusLoaded && status && !status.enabled ? (
        <p
          role="status"
          className="rounded-[var(--radius-md)] border border-[var(--color-ai-border)] bg-[var(--color-ai-subtle)] px-3 py-2 text-sm text-[var(--color-ai-hover)]"
        >
          IA desativada neste ambiente (`AI_ENABLED=false`). Você ainda pode abrir esta tela; as
          respostas indicarão a indisponibilidade.
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="rounded-[var(--radius-md)] bg-[var(--color-danger-subtle)] px-3 py-2 text-sm text-[var(--color-danger)]"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            className="rounded-[var(--radius-md)] border border-[var(--color-ai-border)] bg-[var(--color-surface)] px-3 py-2 text-left text-sm text-[var(--color-ai-hover)] transition-colors hover:bg-[var(--color-ai-subtle)]"
            onClick={() => void send(s)}
            disabled={busy}
          >
            {s}
          </button>
        ))}
      </div>

      <div
        className="flex-1 space-y-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-muted)]">
            Envie uma pergunta ou escolha uma sugestão.
          </p>
        ) : (
          messages.map((m, i) => (
            <div
              key={`${m.role}-${i}`}
              className={
                m.role === "user"
                  ? "ml-6 rounded-[var(--radius-md)] bg-[var(--color-primary-subtle)] px-3 py-2 text-sm"
                  : "card-rail card-rail-ai mr-6 rounded-[var(--radius-md)] border border-[var(--color-ai-border)] bg-[var(--color-ai-subtle)]/50 px-3 py-2 text-sm whitespace-pre-wrap"
              }
            >
              {m.content}
            </div>
          ))
        )}
        {busy ? <p className="text-sm text-[var(--color-ink-muted)]">Pensando…</p> : null}
      </div>

      {pending ? (
        <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--color-warning)]/30 bg-[var(--color-warning-subtle)] p-3">
          <p className="text-sm font-semibold text-[var(--color-warning)]">Confirmação necessária</p>
          <p className="text-sm">{pending.summary}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button fullWidth disabled={busy} onClick={() => void confirmPending()}>
              Confirmar
            </Button>
            <Button
              fullWidth
              variant="outline"
              disabled={busy}
              onClick={() => void cancelPending()}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}

      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <TextArea
          label="Mensagem"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          hint="O contrato aceita texto agora; transcrição de voz poderá alimentar o mesmo campo no futuro."
        />
        <Button variant="ai" fullWidth disabled={busy || !input.trim()} type="submit">
          Enviar
        </Button>
      </form>
    </div>
  );
}
