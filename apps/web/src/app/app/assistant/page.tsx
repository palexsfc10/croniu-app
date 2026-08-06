"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { BackLink } from "@/components/app/back-link";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/text-area";
import { apiFetch } from "@/lib/api";

type AgentStatus = {
  enabled: boolean;
  provider: string;
  model: string;
  tools: string[];
  entitlement_ok?: boolean;
  prompt_version?: string;
};

type PendingAction = {
  id: string;
  thread_id?: string | null;
  tool_name: string;
  risk_class?: string;
  summary: string;
  summary_fields?: Record<string, unknown> | null;
  arguments: Record<string, unknown>;
  expires_at: string;
};

type ChatMessage = {
  id?: string;
  role: "user" | "assistant" | "system";
  content: string;
  pending?: PendingAction | null;
  statusLabel?: string;
};

type Thread = {
  id: string;
  title: string | null;
  status: string;
  updated_at: string;
};

type AgentChatResponse = {
  reply: string;
  status: string;
  thread_id?: string | null;
  pending_action?: PendingAction | null;
  tool_trace?: string[];
  usage?: Record<string, unknown>;
};

const SUGGESTIONS = [
  "Resuma meu dia.",
  "Quem precisa renovar?",
  "Quais pagamentos estão pendentes?",
  "Cadastre um novo cliente.",
  "Crie um compromisso.",
];

function riskLabel(risk?: string) {
  if (risk === "write_sensitive") return "Ação sensível";
  if (risk === "write_common") return "Escrita";
  return "Confirmação";
}

function ConfirmationCard({
  pending,
  busy,
  onConfirm,
  onCancel,
}: {
  pending: PendingAction;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const fields = pending.summary_fields
    ? Object.entries(pending.summary_fields)
    : [];
  return (
    <div
      role="region"
      aria-label="Confirmação de ação"
      className={[
        "mt-3 rounded-[var(--radius-md)] border px-3 py-3",
        pending.risk_class === "write_sensitive"
          ? "border-[var(--color-warning)]/40 bg-[var(--color-warning-subtle)]/50"
          : "border-[var(--color-primary)]/25 bg-[var(--color-primary-subtle)]/35",
      ].join(" ")}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
        {riskLabel(pending.risk_class)} · aguardando confirmação
      </p>
      <p className="mt-1 text-sm font-semibold text-[var(--color-ink)]">{pending.summary}</p>
      {fields.length ? (
        <dl className="mt-2 space-y-1 text-sm">
          {fields.map(([key, value]) => (
            <div key={key} className="flex gap-2">
              <dt className="shrink-0 font-medium text-[var(--color-ink-muted)]">{key}:</dt>
              <dd className="text-[var(--color-ink)]">{String(value)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className="min-h-11"
        >
          Confirmar
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={onCancel}
          className="min-h-11"
        >
          Cancelar
        </Button>
      </div>
    </div>
  );
}

export default function AssistantPage() {
  const liveId = useId();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);

  const scrollToBottom = useCallback(() => {
    const node = bottomRef.current;
    if (node && typeof node.scrollIntoView === "function") {
      node.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, pending, busy, scrollToBottom]);

  const loadThreads = useCallback(async () => {
    const result = await apiFetch<{ items: Thread[] }>("/api/v1/agent/threads");
    if (result.data?.items) setThreads(result.data.items);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await apiFetch<AgentStatus>("/api/v1/agent/status");
      if (cancelled) return;
      if (result.data) setStatus(result.data);
      setStatusLoaded(true);
      await loadThreads();
    })();
    return () => {
      cancelled = true;
    };
  }, [loadThreads]);

  async function openThread(id: string) {
    setError(null);
    setPending(null);
    const detail = await apiFetch<{
      thread: Thread;
      messages: Array<{
        id: string;
        role: string;
        content: string;
        message_type: string;
        metadata_safe?: { pending_action?: PendingAction } | null;
      }>;
    }>(`/api/v1/agent/threads/${id}`);
    if (detail.error) {
      setError(detail.error.message);
      return;
    }
    setThreadId(id);
    const mapped: ChatMessage[] = (detail.data?.messages || [])
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
        pending:
          m.message_type === "pending_card"
            ? m.metadata_safe?.pending_action || null
            : null,
      }));
    setMessages(mapped);
    const lastPending = [...mapped].reverse().find((m) => m.pending)?.pending;
    setPending(lastPending || null);
  }

  async function startNewThread() {
    setMessages([]);
    setPending(null);
    setThreadId(null);
    setError(null);
    setPhase(null);
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setPhase("Consultando");
    setError(null);
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");

    let activeThread = threadId;
    if (!activeThread) {
      const created = await apiFetch<Thread>("/api/v1/agent/threads", {
        method: "POST",
        body: JSON.stringify({ title: trimmed.slice(0, 80) }),
      });
      if (created.error || !created.data) {
        setBusy(false);
        setPhase(null);
        setError(created.error?.message || "Não foi possível criar a conversa.");
        return;
      }
      activeThread = created.data.id;
      setThreadId(activeThread);
      await loadThreads();
    }

    setPhase("Preparando resposta");
    const result = await apiFetch<AgentChatResponse>(
      `/api/v1/agent/threads/${activeThread}/messages`,
      {
        method: "POST",
        body: JSON.stringify({ message: trimmed, input_modality: "text" }),
      },
    );
    setBusy(false);
    setPhase(null);

    if (result.error) {
      const code = result.error.code;
      if (code === "ai_rate_limited" || code === "ai_daily_limit") {
        setError(result.error.message);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: result.error!.message,
            statusLabel: "Limite atingido",
          },
        ]);
        return;
      }
      if (code === "ai_entitlement_denied" || code === "billing_access_denied") {
        setError(result.error.message);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: result.error!.message,
            statusLabel: "Assinatura",
          },
        ]);
        return;
      }
      setError(result.error.message);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Não consegui concluir agora. Tente novamente." },
      ]);
      return;
    }

    const data = result.data!;
    if (data.pending_action) {
      setPhase("Aguardando confirmação");
      setPending(data.pending_action);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply,
          pending: data.pending_action,
          statusLabel: "Preparando ação",
        },
      ]);
    } else {
      setPending(null);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply,
          statusLabel: data.status === "disabled" ? "Indisponível" : "Concluído",
        },
      ]);
    }
    await loadThreads();
  }

  async function confirmPending() {
    if (!pending || busy) return;
    setBusy(true);
    setPhase("Executando");
    const result = await apiFetch<{ status: string; result?: unknown; message?: string }>(
      `/api/v1/agent/pending/${pending.id}/confirm`,
      {
        method: "POST",
        body: JSON.stringify({ arguments: pending.arguments }),
      },
    );
    setBusy(false);
    setPhase(null);
    if (result.error) {
      setError(result.error.message);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: result.error!.message, statusLabel: "Erro" },
      ]);
      return;
    }
    setPending(null);
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: "Ação confirmada e registrada com sucesso.",
        statusLabel: "Concluído",
      },
    ]);
  }

  async function cancelPending() {
    if (!pending || busy) return;
    setBusy(true);
    await apiFetch(`/api/v1/agent/pending/${pending.id}/cancel`, { method: "POST" });
    setBusy(false);
    setPending(null);
    setPhase(null);
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "Ação cancelada.", statusLabel: "Cancelado" },
    ]);
  }

  const disabled =
    !statusLoaded ||
    !status?.enabled ||
    status.entitlement_ok === false;

  return (
    <div className="flex min-h-[calc(100dvh-8rem)] flex-col gap-4 lg:min-h-[calc(100dvh-6rem)] lg:flex-row lg:gap-6">
      <aside className="hidden w-56 shrink-0 flex-col gap-2 lg:flex">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
            Conversas
          </h2>
          <Button type="button" variant="ghost" className="min-h-9 px-2 text-sm" onClick={startNewThread}>
            Nova
          </Button>
        </div>
        <ul className="space-y-1 overflow-y-auto">
          {threads.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => void openThread(t.id)}
                className={[
                  "w-full rounded-[var(--radius-sm)] px-2 py-2 text-left text-sm",
                  t.id === threadId
                    ? "bg-[var(--color-primary-subtle)] font-semibold text-[var(--color-ink)]"
                    : "text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-subtle)]",
                ].join(" ")}
              >
                {t.title || "Conversa"}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <BackLink href="/app" label="Voltar" />
          <Button
            type="button"
            variant="secondary"
            className="min-h-10 lg:hidden"
            onClick={startNewThread}
          >
            Nova conversa
          </Button>
        </div>

        <header className="mb-3 space-y-1">
          <h1 className="h-display text-3xl text-[var(--color-ink)]">Assistente</h1>
          <p className="text-sm text-[var(--color-ink-muted)]">
            Pergunte ou peça algo ao Croniu. Alterações só acontecem depois da sua confirmação.
          </p>
        </header>

        {statusLoaded && !status?.enabled ? (
          <div className="mb-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3 py-3 text-sm text-[var(--color-ink-muted)]">
            O assistente está desativado neste ambiente (`AI_ENABLED`). As consultas e ações
            ficam indisponíveis até a ativação segura.
          </div>
        ) : null}

        {statusLoaded && status?.enabled && status.entitlement_ok === false ? (
          <div className="mb-3 rounded-[var(--radius-md)] border border-[var(--color-warning)]/30 bg-[var(--color-warning-subtle)]/40 px-3 py-3 text-sm">
            Sua assinatura ou período de teste não permite usar o assistente agora.
          </div>
        ) : null}

        <div
          id={liveId}
          aria-live="polite"
          className="flex min-h-0 flex-1 flex-col rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]"
        >
          <div className="flex-1 space-y-3 overflow-y-auto px-3 py-4 sm:px-4">
            {!messages.length ? (
              <div className="space-y-3">
                <p className="text-sm text-[var(--color-ink-muted)]">Sugestões para começar:</p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={disabled || busy}
                      onClick={() => void send(s)}
                      className="min-h-11 rounded-full border border-[var(--color-border)] px-3 py-2 text-left text-sm text-[var(--color-ink)] hover:bg-[var(--color-primary-subtle)]/40 disabled:opacity-50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {messages.map((m, idx) => (
              <div
                key={m.id || `${m.role}-${idx}`}
                className={[
                  "max-w-[92%] rounded-[var(--radius-md)] px-3 py-2.5 text-sm whitespace-pre-wrap",
                  m.role === "user"
                    ? "ml-auto bg-[var(--color-primary)] text-white"
                    : "mr-auto border border-[var(--color-border)] bg-[var(--color-surface-subtle)]/60 text-[var(--color-ink)]",
                ].join(" ")}
              >
                {m.statusLabel && m.role === "assistant" ? (
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
                    {m.statusLabel}
                  </p>
                ) : null}
                {m.content}
                {m.pending ? (
                  <ConfirmationCard
                    pending={m.pending}
                    busy={busy}
                    onConfirm={() => void confirmPending()}
                    onCancel={() => void cancelPending()}
                  />
                ) : null}
              </div>
            ))}

            {busy || phase ? (
              <p className="text-sm text-[var(--color-ink-muted)]" aria-live="polite">
                {phase || "Processando…"}
              </p>
            ) : null}
            {error ? (
              <p className="text-sm text-[var(--color-danger)]" role="alert">
                {error}
              </p>
            ) : null}
            <div ref={bottomRef} />
          </div>

          <form
            className="border-t border-[var(--color-border)] p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <TextArea
              id="assistant-input"
              name="message"
              label="Pergunte ou peça algo ao Croniu"
              rows={2}
              value={input}
              disabled={disabled || busy}
              placeholder="Ex.: Quais são meus compromissos de hoje?"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
            />
            <div className="mt-2 flex justify-end">
              <Button type="submit" disabled={disabled || busy || !input.trim()} className="min-h-11">
                Enviar
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
