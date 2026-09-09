"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { apiFetch, type HomeSummary } from "@/lib/api";
import {
  readVoiceAutoSend,
  writeVoiceAutoSend,
  VOICE_PRIVACY_KEY,
} from "@/lib/assistant-prefs";
import {
  actionHeadline,
  type ActionUiStatus,
  type AgentChatResponse,
  type AgentStatus,
  type ChatMessage,
  type PendingAction,
  type Thread,
  type VoicePhase,
} from "./types";
import { useVoiceRecorder, type VoiceRecorderControls } from "./use-voice-recorder";

const SCROLL_CONTAINER_SELECTOR = "[data-assistant-scroll-container]";
const BOTTOM_SENTINEL_SELECTOR = "[data-assistant-bottom-sentinel]";

function isElementVisible(el: HTMLElement): boolean {
  if (typeof el.checkVisibility === "function") return el.checkVisibility();
  let node: HTMLElement | null = el;
  while (node) {
    if (getComputedStyle(node).display === "none") return false;
    node = node.parentElement;
  }
  return true;
}

/**
 * The global Assistant layer mounts the SAME conversation (this hook's one
 * instance) into two DOM subtrees at once — the desktop panel and the
 * mobile overlay — showing only one per breakpoint via CSS (`hidden
 * lg:block` / `lg:hidden`), not conditional rendering. A plain `useRef`
 * attached via `ref={...}` in both subtrees only ever holds whichever one
 * committed last, which doesn't reliably match whichever is actually
 * visible right now — confirmed live: `scrollToBottom()` was calling
 * `scrollIntoView` on the *hidden* subtree's sentinel, a silent no-op,
 * while the visible transcript stayed pinned at the top through an entire
 * real conversation. Querying fresh by a `data-` marker and picking the
 * currently-visible match sidesteps the ref race entirely.
 */
function getVisibleAssistantEl(selector: string): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const candidates = document.querySelectorAll<HTMLElement>(selector);
  for (const el of candidates) {
    if (isElementVisible(el)) return el;
  }
  return null;
}

function newClientMessageId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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

export type AssistantConversation = ReturnType<typeof useAssistantConversation>;

/**
 * The single "conversation and confirmation machine" — threads, sending,
 * voice orchestration, pending-action confirm/cancel, idempotency locks,
 * entitlement/limit handling. Two callers use this: the full `/app/assistant`
 * page (its own instance, seeded from the URL) and the global persistent
 * layer's panel/overlay (its own instance, seeded by whoever calls `open()`
 * on it). Both render the same presentational components against whatever
 * this hook returns — that's the "one core, two presentations" split. They
 * are deliberately two separate live instances, not one shared one: the
 * page needs to keep working exactly as it does today (774 lines of
 * existing tests render it standalone, with no provider), and forcing a
 * single shared instance would mean either breaking that test suite or
 * making the page depend on a context it doesn't need. The conversation
 * itself is never lost either way — it's a real thread on the backend,
 * reachable from either surface via "Histórico".
 */
export function useAssistantConversation(opts: {
  initialPrompt?: string;
  initialContext?: string | null;
  initialReturnTo?: string | null;
  /** Gates the mount-time data fetches (`/agent/status`, `/agent/threads`,
   * `/home/summary`) — defaults to `true`, matching the full page's
   * always-fetch-on-mount behavior (visiting the page implies wanting the
   * data). The global layer's persistent instance passes `false` until the
   * user actually opens it for the first time, since that instance is
   * mounted on every page load — without this, every navigation in the app
   * would fire 3 extra requests for a panel that may never open. */
  enabled?: boolean;
} = {}) {
  const enabled = opts.enabled ?? true;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottomRef = useRef(true);
  const programmaticScrollRef = useRef(false);
  const actionLockRef = useRef(false);
  const threadsPanelRef = useRef<HTMLDivElement>(null);
  const threadsTriggerRef = useRef<HTMLButtonElement>(null);
  const micMenuRef = useRef<HTMLDivElement>(null);
  const sendLockRef = useRef(false);
  const voicePipelineAbortRef = useRef(false);
  const mountedRef = useRef(true);
  const micLongPressRef = useRef<number | null>(null);
  const wantsNewThreadRef = useRef(false);
  const createThreadPromiseRef = useRef<Promise<string | null> | null>(null);

  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState(opts.initialPrompt || "");
  const [fromVoice, setFromVoice] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [showJump, setShowJump] = useState(false);
  const [threadsOpen, setThreadsOpen] = useState(false);
  const [voicePrivacyAck, setVoicePrivacyAck] = useState(true);
  const [voiceAutoSend, setVoiceAutoSend] = useState(true);
  const [micMenuOpen, setMicMenuOpen] = useState(false);
  const [voiceUiPhase, setVoiceUiPhase] = useState<VoicePhase>("idle");
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  // Where this conversation started from — display-only, never biases tool
  // selection. Mutable (not the page's original one-time useState) so the
  // global layer's `open({context, returnTo})` can set it per-entry.
  const [contextLabel, setContextLabel] = useState(opts.initialContext ?? null);
  const [contextReturnTo, setContextReturnTo] = useState(opts.initialReturnTo ?? null);
  const [homeSummary, setHomeSummary] = useState<HomeSummary | null>(null);

  const maxSeconds = status?.voice?.max_seconds ?? 60;
  const voice: VoiceRecorderControls = useVoiceRecorder(maxSeconds);
  const voiceAvailable =
    Boolean(status?.voice_enabled) && voice.supported && status?.enabled !== false;

  useEffect(() => {
    mountedRef.current = true;
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate voice prefs from localStorage
      setVoicePrivacyAck(localStorage.getItem(VOICE_PRIVACY_KEY) === "1");
      setVoiceAutoSend(readVoiceAutoSend());
    } catch {
      setVoicePrivacyAck(false);
      setVoiceAutoSend(true);
    }
    return () => {
      mountedRef.current = false;
      voicePipelineAbortRef.current = true;
    };
  }, []);

  useEffect(() => {
    if (!threadsOpen && !micMenuOpen) return;
    function onPointerDown(event: MouseEvent) {
      const t = event.target as Node;
      if (
        threadsPanelRef.current?.contains(t) ||
        threadsTriggerRef.current?.contains(t) ||
        micMenuRef.current?.contains(t)
      ) {
        return;
      }
      setThreadsOpen(false);
      setMicMenuOpen(false);
    }
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setThreadsOpen(false);
        setMicMenuOpen(false);
        threadsTriggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [threadsOpen, micMenuOpen]);

  function setAutoSendPreference(enabled: boolean) {
    setVoiceAutoSend(enabled);
    writeVoiceAutoSend(enabled);
  }

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

  const isNearBottom = useCallback(() => {
    const el = getVisibleAssistantEl(SCROLL_CONTAINER_SELECTOR);
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 96;
  }, []);

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      stickToBottomRef.current = true;
      // A "smooth" scrollIntoView fires its own intermediate `scroll`
      // events while it animates. Without this guard, `onTranscriptScroll`
      // reads those as the user scrolling away — if a reply is still
      // growing the transcript's height while the animation is catching
      // up, `isNearBottom()` can transiently read false mid-flight, which
      // flips `stickToBottomRef` off and silently stops autoscroll for the
      // rest of the conversation. The window covers a "smooth" animation's
      // typical duration; "auto" resolves in a single frame so a short
      // window is enough either way.
      programmaticScrollRef.current = true;
      getVisibleAssistantEl(BOTTOM_SENTINEL_SELECTOR)?.scrollIntoView({ behavior, block: "end" });
      setShowJump(false);
      window.setTimeout(
        () => {
          programmaticScrollRef.current = false;
        },
        behavior === "smooth" ? 500 : 50,
      );
    },
    [],
  );

  const onTranscriptScroll = useCallback(() => {
    if (programmaticScrollRef.current) return;
    const near = isNearBottom();
    stickToBottomRef.current = near;
    setShowJump(!near);
  }, [isNearBottom]);

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
    if (result.data?.items) {
      setThreads(result.data.items);
      return result.data.items;
    }
    return [] as Thread[];
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      const result = await apiFetch<AgentStatus>("/api/v1/agent/status");
      if (cancelled) return;
      if (result.data) setStatus(result.data);
      setStatusLoaded(true);
      // List only — never force-open the latest conversation on entry.
      await loadThreads();
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, loadThreads]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      const result = await apiFetch<HomeSummary>("/api/v1/home/summary");
      if (!cancelled && result.data) setHomeSummary(result.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "0px";
    const next = Math.min(node.scrollHeight, 5 * 24 + 24);
    node.style.height = `${next}px`;
  }, [input]);

  async function openThread(id: string) {
    wantsNewThreadRef.current = false;
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
        const snapshot =
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
        const pendingCard = snapshot
          ? {
              ...snapshot,
              status: String(
                m.metadata_safe?.pending_action?.status || snapshot.status || "pending",
              ),
            }
          : null;
        const liveStatus = pendingCard ? mapActionStatus(pendingCard.status) : undefined;
        return {
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          pending: pendingCard,
          actionStatus: liveStatus,
          statusLabel: liveStatus ? actionHeadline(liveStatus) : undefined,
        };
      });
    setMessages(mapped);
    const lastPending = [...mapped]
      .reverse()
      .find((m) => m.pending && m.actionStatus === "pending")?.pending;
    setPending(lastPending || null);
  }

  function startNewThread() {
    wantsNewThreadRef.current = true;
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

  async function ensureThreadForSend(titleHint: string): Promise<string | null> {
    if (createThreadPromiseRef.current) {
      return createThreadPromiseRef.current;
    }
    const promise = (async () => {
      const created = await apiFetch<Thread>("/api/v1/agent/threads", {
        method: "POST",
        body: JSON.stringify({ title: titleHint.slice(0, 80) }),
      });
      if (created.error || !created.data) {
        setError(created.error?.message || "Não foi possível criar a conversa.");
        return null;
      }
      wantsNewThreadRef.current = false;
      return created.data.id;
    })();
    createThreadPromiseRef.current = promise;
    try {
      return await promise;
    } finally {
      createThreadPromiseRef.current = null;
    }
  }

  async function send(
    text: string,
    modality: "text" | "voice_transcript" = "text",
    sendOpts?: { clientMessageId?: string },
  ) {
    const trimmed = text.trim();
    if (!trimmed || busy || sendLockRef.current) return;
    sendLockRef.current = true;
    const clientMessageId = sendOpts?.clientMessageId || newClientMessageId();
    setBusy(true);
    setPhase(modality === "voice_transcript" ? "Enviando…" : "Consultando");
    setError(null);
    setFromVoice(false);
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");
    stickToBottomRef.current = true;

    let activeThread = threadId;
    if (!activeThread) {
      activeThread = await ensureThreadForSend(trimmed);
      if (!activeThread) {
        sendLockRef.current = false;
        if (!mountedRef.current) return;
        setBusy(false);
        setPhase(null);
        return;
      }
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
          { role: "assistant", content: result.error!.message, statusLabel: "Limite atingido" },
        ]);
        return;
      }
      if (code === "ai_entitlement_denied" || code === "billing_access_denied") {
        setError(result.error.message);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: result.error!.message, statusLabel: "Assinatura" },
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
        body: JSON.stringify({ arguments: action.arguments, confirmation_key: confirmationKey }),
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
    const result = await apiFetch<AgentChatResponse>(`/api/v1/agent/pending/${action.id}/cancel`, {
      method: "POST",
    });
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

  function cancelRecording() {
    voicePipelineAbortRef.current = true;
    voice.cancel();
    setVoiceUiPhase("idle");
    setPhase(null);
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

  function onSubmit(e: { preventDefault: () => void }) {
    e.preventDefault();
    void send(input, fromVoice ? "voice_transcript" : "text");
  }

  const recentActivity = useMemo(
    () =>
      [...messages]
        .reverse()
        .filter(
          (m) =>
            m.pending &&
            m.actionStatus &&
            m.actionStatus !== "pending" &&
            m.actionStatus !== "executing",
        )
        .slice(0, 6),
    [messages],
  );

  const disabled = !statusLoaded || !status?.enabled || status.entitlement_ok === false;
  const recording =
    voice.phase === "recording" ||
    voice.phase === "requesting_permission" ||
    voice.phase === "stopping" ||
    voiceUiPhase === "uploading" ||
    voiceUiPhase === "transcribing";
  const empty = messages.length === 0;

  /** Applied once by a caller that owns entry params (the page reading the
   * URL, or the layer's `open()`) — never overwrites an in-progress
   * conversation, so a differently-labeled entry link can't silently
   * discard what the user was already doing. */
  function applyEntryContext(next: { prompt?: string; context?: string | null; returnTo?: string | null }) {
    if (threadId || messages.length > 0) return;
    if (next.prompt) setInput(next.prompt);
    if (next.context !== undefined) setContextLabel(next.context);
    if (next.returnTo !== undefined) setContextReturnTo(next.returnTo);
  }

  return {
    textareaRef,
    threadsPanelRef,
    threadsTriggerRef,
    micMenuRef,
    micLongPressRef,
    status,
    statusLoaded,
    threads,
    threadId,
    messages,
    input,
    setInput,
    fromVoice,
    setFromVoice,
    busy,
    phase,
    error,
    pending,
    showJump,
    threadsOpen,
    setThreadsOpen,
    voicePrivacyAck,
    voiceAutoSend,
    setAutoSendPreference,
    micMenuOpen,
    setMicMenuOpen,
    voiceUiPhase,
    voiceNotice,
    setVoiceNotice,
    contextLabel,
    contextReturnTo,
    homeSummary,
    voice,
    voiceAvailable,
    disabled,
    recording,
    empty,
    recentActivity,
    isNearBottom,
    scrollToBottom,
    onTranscriptScroll,
    openThread,
    startNewThread,
    send,
    confirmPending,
    cancelPending,
    ackVoicePrivacy,
    handleMicClick,
    cancelRecording,
    finishRecording,
    onComposerKeyDown,
    onSubmit,
    applyEntryContext,
  };
}
