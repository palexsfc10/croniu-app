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
  status?: string;
  result?: Record<string, unknown> | null;
  error_code?: string | null;
};

type ActionUiStatus =
  | "pending"
  | "executing"
  | "executed"
  | "cancelled"
  | "expired"
  | "failed";

type ChatMessage = {
  id?: string;
  role: "user" | "assistant" | "system";
  content: string;
  pending?: PendingAction | null;
  actionStatus?: ActionUiStatus;
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
  action_status?: string | null;
  result?: Record<string, unknown> | null;
  idempotent_replay?: boolean;
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

function actionHeadline(status: ActionUiStatus, risk?: string) {
  if (status === "executing") return "Executando…";
  if (status === "executed") return "Ação concluída";
  if (status === "cancelled") return "Ação cancelada";
  if (status === "expired") return "Proposta expirada";
  if (status === "failed") return "Ação não concluída";
  return `${riskLabel(risk)} · aguardando confirmação`;
}

function ConfirmationCard({
  pending,
  actionStatus,
  busy,
  onConfirm,
  onCancel,
}: {
  pending: PendingAction;
  actionStatus: ActionUiStatus;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const fields = pending.summary_fields
    ? Object.entries(pending.summary_fields)
    : [];
  const interactive = actionStatus === "pending" && !busy;
  return (
    <div
      role="region"
      aria-label="Confirmação de ação"
      className={[
        "mt-3 rounded-[var(--radius-md)] border px-3 py-3",
        actionStatus === "failed" || actionStatus === "expired"
          ? "border-[var(--color-danger)]/30 bg-[var(--color-surface-subtle)]"
          : actionStatus === "executed"
            ? "border-[var(--color-primary)]/30 bg-[var(--color-primary-subtle)]/35"
            : pending.risk_class === "write_sensitive"
              ? "border-[var(--color-warning)]/40 bg-[var(--color-warning-subtle)]/50"
              : "border-[var(--color-primary)]/25 bg-[var(--color-primary-subtle)]/35",
      ].join(" ")}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
        {actionHeadline(actionStatus, pending.risk_class)}
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
      {actionStatus === "pending" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={!interactive}
            onClick={onConfirm}
            className="min-h-11"
          >
            {busy ? "Confirmando…" : "Confirmar"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={!interactive}
            onClick={onCancel}
            className="min-h-11"
          >
            Cancelar
          </Button>
        </div>
      ) : null}
      {actionStatus === "failed" || actionStatus === "expired" || actionStatus === "cancelled" ? (
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
          Se ainda precisar, peça uma nova proposta na conversa.
        </p>
      ) : null}
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
  const actionLockRef = useRef(false);

  function patchPendingMessage(pendingId: string, patch: Partial<ChatMessage>) {
    setMessages((prev) =>
      prev.map((m) =>
        m.pending?.id === pendingId
          ? {
              ...m,
              ...patch,
              pending: patch.pending === undefined ? m.pending : patch.pending,
              actionStatus: patch.actionStatus ?? m.actionStatus,
            }
          : m,
      ),
    );
  }

  function mapActionStatus(raw?: string | null): ActionUiStatus {
    if (raw === "executed" || raw === "cancelled" || raw === "expired" || raw === "failed" || raw === "executing") {
      return raw;
    }
    if (raw === "confirmed") return "failed";
    return "pending";
  }

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
        metadata_safe?: {
          pending_action?: PendingAction;
          pending_action_id?: string;
          tool_name?: string;
          summary_fields?: Record<string, unknown>;
        } | null;
      }>;
    }>(`/api/v1/agent/threads/${id}`);
    if (detail.error) {
      setError(detail.error.message);
      return;
    }
    setThreadId(id);
    const mapped: ChatMessage[] = (detail.data?.messages || [])
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => {
        const pendingCard =
          m.message_type === "pending_card"
            ? m.metadata_safe?.pending_action ||
              (m.metadata_safe?.pending_action_id
                ? {
                    id: String(m.metadata_safe.pending_action_id),
                    tool_name: String(m.metadata_safe.tool_name || ""),
                    summary: m.content,
                    summary_fields:
                      (m.metadata_safe.summary_fields as Record<string, unknown>) || null,
                    arguments: {},
                    expires_at: "",
                    status: "pending",
                  }
                : null)
            : null;
        return {
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          pending: pendingCard,
          actionStatus: pendingCard ? ("pending" as ActionUiStatus) : undefined,
          statusLabel: pendingCard ? "Aguardando confirmação" : undefined,
        };
      });
    setMessages(mapped);
    const lastPending = [...mapped]
      .reverse()
      .find((m) => m.pending && (m.actionStatus === "pending" || !m.actionStatus))?.pending;
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
      setPending({ ...data.pending_action, status: data.pending_action.status || "pending" });
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply,
          pending: data.pending_action,
          actionStatus: "pending",
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

  async function confirmPending(target?: PendingAction) {
    const action = target || pending;
    if (!action || actionLockRef.current) return;
    actionLockRef.current = true;
    setBusy(true);
    setPhase("Executando");
    setError(null);
    patchPendingMessage(action.id, { actionStatus: "executing", statusLabel: "Executando" });

    const confirmationKey =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `confirm-${action.id}-${Date.now()}`;

    const result = await apiFetch<AgentChatResponse>(
      `/api/v1/agent/pending/${action.id}/confirm`,
      {
        method: "POST",
        headers: { "X-Request-Id": confirmationKey },
        body: JSON.stringify({
          arguments: action.arguments,
          confirmation_key: confirmationKey,
        }),
      },
    );

    actionLockRef.current = false;
    setBusy(false);
    setPhase(null);

    if (result.error) {
      const details = result.error.details as { action_status?: string } | undefined;
      const nextStatus = mapActionStatus(details?.action_status || result.error.code);
      const human = result.error.message;
      setError(human);
      setPending(null);
      patchPendingMessage(action.id, {
        actionStatus: nextStatus === "pending" ? "failed" : nextStatus,
        statusLabel: actionHeadline(nextStatus === "pending" ? "failed" : nextStatus),
        content: human,
      });
      return;
    }

    const data = result.data!;
    const nextStatus = mapActionStatus(data.action_status || data.status || "executed");
    setPending(null);
    setError(null);
    patchPendingMessage(action.id, {
      actionStatus: nextStatus,
      statusLabel: "Ação concluída",
      content: data.reply,
      pending: data.pending_action
        ? { ...data.pending_action, status: nextStatus }
        : { ...action, status: nextStatus, result: data.result },
    });
  }

  async function cancelPending(target?: PendingAction) {
    const action = target || pending;
    if (!action || actionLockRef.current) return;
    actionLockRef.current = true;
    setBusy(true);
    setPhase("Cancelando");
    setError(null);
    const result = await apiFetch<AgentChatResponse>(
      `/api/v1/agent/pending/${action.id}/cancel`,
      { method: "POST" },
    );
    actionLockRef.current = false;
    setBusy(false);
    setPhase(null);
    if (result.error) {
      const details = result.error.details as { action_status?: string } | undefined;
      const nextStatus = mapActionStatus(details?.action_status || "cancelled");
      setError(result.error.message);
      setPending(null);
      patchPendingMessage(action.id, {
        actionStatus: nextStatus,
        statusLabel: actionHeadline(nextStatus),
        content: result.error.message,
      });
      return;
    }
    setPending(null);
    setError(null);
    patchPendingMessage(action.id, {
      actionStatus: "cancelled",
      statusLabel: "Cancelado",
      content: result.data?.reply || "Ação cancelada.",
    });
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
                    actionStatus={m.actionStatus || "pending"}
                    busy={busy && pending?.id === m.pending.id}
                    onConfirm={() => void confirmPending(m.pending!)}
                    onCancel={() => void cancelPending(m.pending!)}
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
