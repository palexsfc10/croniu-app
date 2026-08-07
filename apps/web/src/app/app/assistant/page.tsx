"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import Link from "next/link";
import { BrandMark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import {
  IconChevronDown,
  IconMic,
  IconPlus,
  IconSend,
  IconStop,
  IconX,
} from "@/components/ui/icons";
import { apiFetch } from "@/lib/api";
import { ProposalCard } from "@/components/app/assistant/proposal-card";
import {
  SUGGESTIONS,
  actionHeadline,
  type ActionUiStatus,
  type AgentChatResponse,
  type AgentStatus,
  type ChatMessage,
  type PendingAction,
  type Thread,
  type VoicePhase,
} from "@/components/app/assistant/types";
import {
  formatElapsed,
  useVoiceRecorder,
} from "@/components/app/assistant/use-voice-recorder";

const VOICE_PRIVACY_KEY = "croniu.assistant.voicePrivacyAck";
const VOICE_AUTO_SEND_KEY = "croniu.assistant.voiceAutoSend";

function newClientMessageId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function TypingIndicator() {
  return (
    <div
      className="assistant-msg-enter mr-auto flex max-w-[88%] items-center gap-2 rounded-2xl rounded-bl-md bg-[var(--color-surface)] px-3.5 py-3 shadow-[var(--shadow-sm)] ring-1 ring-[var(--color-border)]/80"
      aria-label="Assistente digitando"
    >
      <span className="assistant-typing-dot h-1.5 w-1.5 rounded-full bg-[var(--color-ink-muted)]" />
      <span className="assistant-typing-dot h-1.5 w-1.5 rounded-full bg-[var(--color-ink-muted)]" />
      <span className="assistant-typing-dot h-1.5 w-1.5 rounded-full bg-[var(--color-ink-muted)]" />
    </div>
  );
}

function MessageBubble({
  message,
  busy,
  pendingId,
  onConfirm,
  onCancel,
}: {
  message: ChatMessage;
  busy: boolean;
  pendingId: string | null;
  onConfirm: (pending: PendingAction) => void;
  onCancel: (pending: PendingAction) => void;
}) {
  const isUser = message.role === "user";
  return (
    <div
      className={[
        "assistant-msg-enter flex w-full gap-2",
        isUser ? "justify-end" : "justify-start",
      ].join(" ")}
    >
      {!isUser ? (
        <div
          className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-ai-subtle)] ring-1 ring-[var(--color-ai-border)]"
          aria-hidden
        >
          <BrandMark size="xs" decorative />
        </div>
      ) : null}
      <div
        className={[
          "flex min-w-0 flex-col",
          isUser ? "max-w-[82%] items-end" : "max-w-[88%] items-start",
        ].join(" ")}
      >
        {message.pending ? (
          <>
            {message.content ? (
              <div className="mb-1 whitespace-pre-wrap rounded-2xl rounded-bl-md bg-[var(--color-surface)] px-3.5 py-2.5 text-sm leading-relaxed text-[var(--color-ink)] shadow-[var(--shadow-sm)] ring-1 ring-[var(--color-border)]/70">
                {message.content}
              </div>
            ) : null}
            <ProposalCard
              pending={message.pending}
              actionStatus={message.actionStatus || "pending"}
              busy={busy && pendingId === message.pending.id}
              onConfirm={() => onConfirm(message.pending!)}
              onCancel={() => onCancel(message.pending!)}
            />
          </>
        ) : (
          <div
            className={[
              "whitespace-pre-wrap px-3.5 py-2.5 text-sm leading-relaxed",
              isUser
                ? "rounded-2xl rounded-br-md bg-[var(--color-primary)] text-white shadow-[var(--shadow-sm)]"
                : "rounded-2xl rounded-bl-md bg-[var(--color-surface)] text-[var(--color-ink)] shadow-[var(--shadow-sm)] ring-1 ring-[var(--color-border)]/70",
            ].join(" ")}
          >
            {message.content}
          </div>
        )}
        {message.statusLabel && !message.pending && !isUser ? (
          <p className="mt-1 px-1 text-[11px] text-[var(--color-ink-subtle)]">
            {message.statusLabel}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default function AssistantPage() {
  const liveId = useId();
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottomRef = useRef(true);
  const actionLockRef = useRef(false);

  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [fromVoice, setFromVoice] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [showJump, setShowJump] = useState(false);
  const [threadsOpen, setThreadsOpen] = useState(false);
  const [voicePrivacyAck, setVoicePrivacyAck] = useState(true);
  const [voiceAutoSend, setVoiceAutoSend] = useState(true);
  const [voiceUiPhase, setVoiceUiPhase] = useState<VoicePhase>("idle");
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const sendLockRef = useRef(false);
  const voicePipelineAbortRef = useRef(false);
  const mountedRef = useRef(true);

  const maxSeconds = status?.voice?.max_seconds ?? 60;
  const voice = useVoiceRecorder(maxSeconds);
  const voiceAvailable =
    Boolean(status?.voice_enabled) && voice.supported && status?.enabled !== false;

  useEffect(() => {
    mountedRef.current = true;
    try {
      setVoicePrivacyAck(localStorage.getItem(VOICE_PRIVACY_KEY) === "1");
      const auto = localStorage.getItem(VOICE_AUTO_SEND_KEY);
      // Default ON when unset
      setVoiceAutoSend(auto !== "0");
    } catch {
      setVoicePrivacyAck(false);
      setVoiceAutoSend(true);
    }
    return () => {
      mountedRef.current = false;
      voicePipelineAbortRef.current = true;
    };
  }, []);

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
    if (
      raw === "executed" ||
      raw === "cancelled" ||
      raw === "expired" ||
      raw === "failed" ||
      raw === "executing"
    ) {
      return raw;
    }
    if (raw === "confirmed") return "failed";
    return "pending";
  }

  const isNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 96;
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ behavior, block: "end" });
  }, []);

  useEffect(() => {
    if (stickToBottomRef.current) {
      scrollToBottom(messages.length <= 1 ? "auto" : "smooth");
      setShowJump(false);
    } else {
      setShowJump(true);
    }
  }, [messages, busy, phase, scrollToBottom]);

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

  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "0px";
    const next = Math.min(node.scrollHeight, 5 * 24 + 24);
    node.style.height = `${next}px`;
  }, [input]);

  async function openThread(id: string) {
    setError(null);
    setPending(null);
    setThreadsOpen(false);
    stickToBottomRef.current = true;
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
    setFromVoice(false);
    setInput("");
    setThreadsOpen(false);
    stickToBottomRef.current = true;
  }

  async function send(
    text: string,
    modality: "text" | "voice_transcript" = "text",
    options?: { clientMessageId?: string },
  ) {
    const trimmed = text.trim();
    if (!trimmed || busy || sendLockRef.current) return;
    sendLockRef.current = true;
    const clientMessageId = options?.clientMessageId || newClientMessageId();
    setBusy(true);
    setPhase(modality === "voice_transcript" ? "Enviando…" : "Consultando");
    setError(null);
    setFromVoice(false);
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");
    stickToBottomRef.current = true;

    let activeThread = threadId;
    if (!activeThread) {
      const created = await apiFetch<Thread>("/api/v1/agent/threads", {
        method: "POST",
        body: JSON.stringify({ title: trimmed.slice(0, 80) }),
      });
      if (created.error || !created.data) {
        sendLockRef.current = false;
        if (!mountedRef.current) return;
        setBusy(false);
        setPhase(null);
        setError(created.error?.message || "Não foi possível criar a conversa.");
        return;
      }
      activeThread = created.data.id;
      if (mountedRef.current) {
        setThreadId(activeThread);
        await loadThreads();
      }
    }

    if (!mountedRef.current || voicePipelineAbortRef.current) {
      sendLockRef.current = false;
      return;
    }

    setPhase("Preparando resposta");
    const result = await apiFetch<AgentChatResponse>(
      `/api/v1/agent/threads/${activeThread}/messages`,
      {
        method: "POST",
        headers: { "X-Request-Id": clientMessageId },
        body: JSON.stringify({
          message: trimmed,
          input_modality: modality,
          client_message_id: clientMessageId,
        }),
      },
    );
    sendLockRef.current = false;
    if (!mountedRef.current) return;
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
          statusLabel: data.status === "disabled" ? "Indisponível" : undefined,
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

  function ackVoicePrivacy() {
    try {
      localStorage.setItem(VOICE_PRIVACY_KEY, "1");
    } catch {
      /* ignore */
    }
    setVoicePrivacyAck(true);
  }

  async function handleMicClick() {
    if (
      voice.phase === "requesting_permission" ||
      voice.phase === "recording" ||
      voice.phase === "stopping" ||
      voice.phase === "uploading" ||
      voiceUiPhase === "uploading" ||
      voiceUiPhase === "transcribing"
    ) {
      return;
    }
    setVoiceNotice(null);
    setError(null);
    if (!voicePrivacyAck) {
      setVoiceNotice(
        "O áudio será enviado com segurança para transcrição e descartado após o processamento.",
      );
      return;
    }
    await voice.start();
  }

  function setAutoSendPreference(enabled: boolean) {
    setVoiceAutoSend(enabled);
    try {
      localStorage.setItem(VOICE_AUTO_SEND_KEY, enabled ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  async function finishRecording() {
    voicePipelineAbortRef.current = false;
    setVoiceUiPhase("stopping");
    const blob = await voice.stop();
    if (!blob || blob.size < 64) {
      setVoiceUiPhase("error");
      setError("Não identificamos fala nesse áudio. Tente novamente.");
      voice.reset();
      setVoiceUiPhase("idle");
      return;
    }
    setVoiceUiPhase("uploading");
    setPhase("Transcrevendo…");
    const form = new FormData();
    const ext = blob.type.includes("mp4") ? "mp4" : blob.type.includes("ogg") ? "ogg" : "webm";
    form.append("file", blob, `voice.${ext}`);
    form.append("duration_seconds", String(voice.elapsedSeconds || 1));
    setVoiceUiPhase("transcribing");
    const clientMessageId = newClientMessageId();
    const result = await apiFetch<{ text: string }>("/api/v1/agent/transcribe", {
      method: "POST",
      headers: { "X-Request-Id": `tx-${clientMessageId}` },
      body: form,
    });
    voice.reset();
    if (!mountedRef.current || voicePipelineAbortRef.current) {
      setVoiceUiPhase("idle");
      setPhase(null);
      return;
    }
    if (result.error) {
      setVoiceUiPhase("error");
      setError(result.error.message);
      setPhase(null);
      setVoiceUiPhase("idle");
      return;
    }
    const text = result.data?.text?.trim() || "";
    if (!text) {
      setError("Não identificamos fala nesse áudio. Tente novamente.");
      setPhase(null);
      setVoiceUiPhase("idle");
      return;
    }

    if (!voiceAutoSend) {
      setInput(text);
      setFromVoice(true);
      setVoiceUiPhase("ready");
      setPhase(null);
      setVoiceNotice("Texto da voz pronto para revisão. Edite se quiser e toque em enviar.");
      textareaRef.current?.focus();
      window.setTimeout(() => setVoiceUiPhase("idle"), 400);
      return;
    }

    // Default fluid path: transcribe → auto-send through the same textual pipeline.
    setVoiceUiPhase("idle");
    setPhase("Enviando…");
    await send(text, "voice_transcript", { clientMessageId });
  }

  function onComposerKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      const isMobile =
        typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
      if (!isMobile) {
        e.preventDefault();
        void send(input, fromVoice ? "voice_transcript" : "text");
      }
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send(input, fromVoice ? "voice_transcript" : "text");
  }

  const disabled =
    !statusLoaded || !status?.enabled || status.entitlement_ok === false;
  const recording =
    voice.phase === "recording" ||
    voice.phase === "requesting_permission" ||
    voice.phase === "stopping" ||
    voiceUiPhase === "uploading" ||
    voiceUiPhase === "transcribing";
  const empty = messages.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[linear-gradient(180deg,#f7f8fc_0%,#eef2ff22_40%,#f8f9fc_100%)] md:flex-row">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-[var(--color-border)]/80 bg-[var(--color-surface)]/70 md:flex">
        <div className="flex items-center justify-between gap-2 px-3 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
            Conversas
          </h2>
          <Button
            type="button"
            variant="ghost"
            className="min-h-9 min-w-9 px-2"
            aria-label="Nova conversa"
            onClick={() => void startNewThread()}
          >
            <IconPlus className="h-4 w-4" />
          </Button>
        </div>
        <ul className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
          {threads.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => void openThread(t.id)}
                className={[
                  "w-full rounded-[var(--radius-sm)] px-2.5 py-2 text-left text-sm",
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

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border)]/70 bg-[var(--color-surface)]/90 px-3 py-2.5 backdrop-blur">
          <Link
            href="/app"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-md)] text-sm font-semibold text-[var(--color-link)] hover:bg-[var(--color-surface-subtle)]"
          >
            Voltar
          </Link>
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-ai-subtle)] ring-1 ring-[var(--color-ai-border)]"
            aria-hidden
          >
            <BrandMark size="xs" decorative />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold text-[var(--color-ink)]">
              Assistente Croniu
            </h1>
            <p className="truncate text-xs text-[var(--color-ink-muted)]">
              {!statusLoaded
                ? "Carregando…"
                : !status?.enabled
                  ? "Indisponível neste ambiente"
                  : status.entitlement_ok === false
                    ? "Assinatura necessária"
                    : "Organize sua rotina com IA"}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 min-w-11 px-2 md:hidden"
            aria-label="Conversas"
            aria-expanded={threadsOpen}
            onClick={() => setThreadsOpen((v) => !v)}
          >
            <IconChevronDown className={threadsOpen ? "rotate-180" : ""} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 min-w-11 px-2"
            aria-label="Nova conversa"
            onClick={() => void startNewThread()}
          >
            <IconPlus />
          </Button>
        </header>

        {threadsOpen ? (
          <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 md:hidden">
            <ul className="max-h-40 space-y-1 overflow-y-auto">
              {threads.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    className="w-full rounded-[var(--radius-sm)] px-2 py-2 text-left text-sm text-[var(--color-ink)] hover:bg-[var(--color-surface-subtle)]"
                    onClick={() => void openThread(t.id)}
                  >
                    {t.title || "Conversa"}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div
          id={liveId}
          aria-live="polite"
          className="relative flex min-h-0 flex-1 flex-col"
        >
          <div
            ref={scrollRef}
            className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-4"
            onScroll={() => {
              const near = isNearBottom();
              stickToBottomRef.current = near;
              setShowJump(!near);
            }}
          >
            <div className="mx-auto flex w-full max-w-[860px] flex-col gap-3">
              {empty ? (
                <div className="assistant-msg-enter mx-auto max-w-md px-2 py-8 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-ai-subtle)] ring-1 ring-[var(--color-ai-border)]">
                    <BrandMark size="sm" decorative />
                  </div>
                  <p className="text-lg font-semibold text-[var(--color-ink)]">Olá</p>
                  <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                    Pergunte ou peça algo ao Croniu. Alterações só acontecem depois da sua
                    confirmação.
                  </p>
                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        disabled={disabled || busy}
                        onClick={() => {
                          setInput(s);
                          void send(s);
                        }}
                        className="min-h-11 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2 text-left text-sm text-[var(--color-ink)] shadow-[var(--shadow-sm)] hover:bg-[var(--color-primary-subtle)]/50 disabled:opacity-50"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {messages.map((m, idx) => (
                <MessageBubble
                  key={m.id || `${m.role}-${idx}`}
                  message={m}
                  busy={busy}
                  pendingId={pending?.id || null}
                  onConfirm={(p) => void confirmPending(p)}
                  onCancel={(p) => void cancelPending(p)}
                />
              ))}

              {busy && !recording ? <TypingIndicator /> : null}

              {error ? (
                <p className="text-sm text-[var(--color-danger)]" role="alert">
                  {error}
                </p>
              ) : null}
              <div ref={bottomRef} className="h-2" />
            </div>
          </div>

          {showJump ? (
            <button
              type="button"
              className="absolute bottom-3 left-1/2 z-10 inline-flex min-h-11 -translate-x-1/2 items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs font-semibold text-[var(--color-ink)] shadow-[var(--shadow-md)]"
              onClick={() => {
                stickToBottomRef.current = true;
                scrollToBottom();
                setShowJump(false);
              }}
            >
              Ir para o final
              <IconChevronDown className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-[var(--color-border)]/80 bg-[var(--color-surface)]/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur">
          <div className="mx-auto w-full max-w-[860px]">
            {voiceNotice ? (
              <div className="mb-2 flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--color-ai-subtle)] px-3 py-2 text-xs text-[var(--color-ink)]">
                <p className="flex-1">{voiceNotice}</p>
                {!voicePrivacyAck ? (
                  <Button
                    type="button"
                    className="min-h-9 px-3 text-xs"
                    onClick={() => {
                      ackVoicePrivacy();
                      setVoiceNotice(null);
                      void voice.start();
                    }}
                  >
                    Entendi
                  </Button>
                ) : (
                  <button
                    type="button"
                    className="min-h-9 min-w-9 text-[var(--color-ink-muted)]"
                    aria-label="Fechar aviso"
                    onClick={() => setVoiceNotice(null)}
                  >
                    <IconX className="h-4 w-4" />
                  </button>
                )}
              </div>
            ) : null}

            {recording ? (
              <div
                className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-danger)]/25 bg-[var(--color-surface)] px-3 py-3 shadow-[var(--shadow-sm)]"
                role="status"
                aria-live="polite"
              >
                <span
                  className="assistant-rec-pulse h-3 w-3 rounded-full bg-[var(--color-danger)]"
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[var(--color-ink)]">
                    {voiceUiPhase === "transcribing" || voiceUiPhase === "uploading"
                      ? "Transcrevendo…"
                      : voice.phase === "requesting_permission"
                        ? "Solicitando microfone…"
                        : "Gravando"}
                  </p>
                  <p className="text-xs text-[var(--color-ink-muted)]">
                    {voiceUiPhase === "transcribing"
                      ? "Aguarde um momento"
                      : `Duração ${formatElapsed(voice.elapsedSeconds)} · máx. ${maxSeconds}s`}
                  </p>
                  <div className="mt-2 flex h-6 items-end gap-1" aria-hidden>
                    {voice.levels.map((level, i) => (
                      <span
                        key={i}
                        className="w-1.5 rounded-full bg-[var(--color-danger)]/70"
                        style={{ height: `${Math.round(level * 100)}%` }}
                      />
                    ))}
                  </div>
                </div>
                {voiceUiPhase === "transcribing" || voiceUiPhase === "uploading" ? null : (
                  <>
                    <Button
                      type="button"
                      variant="secondary"
                      className="min-h-11 min-w-11 px-2"
                      aria-label="Cancelar gravação"
                      onClick={() => {
                        voicePipelineAbortRef.current = true;
                        voice.cancel();
                        setVoiceUiPhase("idle");
                        setPhase(null);
                      }}
                    >
                      <IconX />
                    </Button>
                    <Button
                      type="button"
                      className="min-h-11 min-w-11 px-2"
                      aria-label="Finalizar gravação"
                      onClick={() => void finishRecording()}
                    >
                      <IconStop />
                    </Button>
                  </>
                )}
              </div>
            ) : (
              <form onSubmit={onSubmit} className="flex items-end gap-2">
                <label className="sr-only" htmlFor="assistant-input">
                  Mensagem para o assistente
                </label>
                <div className="relative min-w-0 flex-1">
                  <textarea
                    ref={textareaRef}
                    id="assistant-input"
                    name="message"
                    rows={1}
                    value={input}
                    disabled={disabled || busy}
                    placeholder="Pergunte ou peça algo…"
                    onChange={(e) => {
                      setInput(e.target.value);
                      if (fromVoice && e.target.value !== input) setFromVoice(true);
                    }}
                    onKeyDown={onComposerKeyDown}
                    className="max-h-[9rem] min-h-11 w-full resize-none rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2.5 text-sm text-[var(--color-ink)] shadow-[var(--shadow-sm)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] disabled:opacity-60"
                  />
                  {fromVoice ? (
                    <span className="pointer-events-none absolute -top-2 right-3 rounded-full bg-[var(--color-ai-subtle)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-ai-hover)]">
                      Da voz
                    </span>
                  ) : null}
                </div>
                {input.trim() ? (
                  <Button
                    type="submit"
                    disabled={disabled || busy}
                    className="min-h-11 min-w-11 shrink-0 px-2"
                    aria-label="Enviar mensagem"
                  >
                    <IconSend />
                  </Button>
                ) : voiceAvailable ? (
                  <Button
                    type="button"
                    variant="ai"
                    disabled={
                      disabled ||
                      busy ||
                      voice.phase === "requesting_permission" ||
                      voice.phase === "stopping"
                    }
                    className="min-h-11 min-w-11 shrink-0 px-2"
                    aria-label={
                      voice.phase === "requesting_permission"
                        ? "Solicitando acesso ao microfone"
                        : "Gravar mensagem de voz"
                    }
                    aria-busy={voice.phase === "requesting_permission"}
                    onClick={() => void handleMicClick()}
                  >
                    <IconMic />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    disabled
                    className="min-h-11 min-w-11 shrink-0 px-2"
                    aria-label="Enviar mensagem"
                  >
                    <IconSend />
                  </Button>
                )}
              </form>
            )}
            {voice.error ? (
              <p className="mt-2 text-xs text-[var(--color-danger)]" role="alert">
                {voice.error}
              </p>
            ) : null}
            {!voiceAvailable && status?.enabled && statusLoaded ? (
              <p className="mt-1 text-[11px] text-[var(--color-ink-subtle)]">
                {status.voice_enabled === false
                  ? "Entrada por voz desativada neste ambiente."
                  : voice.supported
                    ? null
                    : "Gravação de voz não disponível neste navegador."}
              </p>
            ) : null}
            {voiceAvailable ? (
              <button
                type="button"
                className="mt-2 text-left text-[11px] font-medium text-[var(--color-ink-muted)] underline-offset-2 hover:underline"
                onClick={() => setAutoSendPreference(!voiceAutoSend)}
              >
                Enviar voz automaticamente: {voiceAutoSend ? "ligado" : "desligado"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
