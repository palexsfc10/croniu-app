"use client";

import Link from "next/link";
import {
  IconCalendarDays,
  IconChevronDown,
  IconClipboardList,
  IconShieldCheck,
  IconSparkles,
  IconUsersRound,
} from "@/components/ui/icons";
import { ProposalCard } from "./proposal-card";
import { SafeChatMarkdown } from "./safe-chat-markdown";
import { SuggestionGrid } from "./suggestion-grid";
import { ASSISTANT_SUGGESTIONS, type ChatMessage, type PendingAction } from "./types";
import type { AssistantConversation } from "./use-assistant-conversation";
import type { personalGreeting } from "@/lib/greeting";

type Greeting = ReturnType<typeof personalGreeting>;

function TypingIndicator() {
  return (
    <div
      className="assistant-msg-enter mr-auto flex max-w-[88%] items-center gap-2 rounded-2xl rounded-bl-md bg-[var(--color-surface)] px-3.5 py-3 shadow-sm ring-1 ring-[var(--color-border)]/80"
      aria-label="Cronia digitando"
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
      className={["assistant-msg-enter flex w-full gap-2", isUser ? "justify-end" : "justify-start"].join(
        " ",
      )}
    >
      <div
        className={[
          "flex min-w-0 flex-col",
          isUser ? "max-w-[82%] items-end" : "max-w-[88%] items-start",
        ].join(" ")}
      >
        {message.pending ? (
          <>
            {message.content ? (
              <div className="mb-1 rounded-2xl rounded-bl-md bg-[var(--color-surface)] px-3.5 py-2.5 shadow-sm ring-1 ring-[var(--color-border)]/70">
                <SafeChatMarkdown text={message.content} />
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
              "px-3.5 py-2.5 text-sm leading-relaxed",
              isUser
                ? "whitespace-pre-wrap rounded-2xl rounded-br-md bg-[var(--color-primary)] text-white shadow-sm"
                : "rounded-2xl rounded-bl-md bg-[var(--color-surface)] text-[var(--color-ink)] shadow-sm ring-1 ring-[var(--color-border)]/70",
            ].join(" ")}
          >
            {isUser ? message.content : <SafeChatMarkdown text={message.content} />}
          </div>
        )}
        {message.statusLabel && !message.pending && !isUser ? (
          <p className="mt-1 px-1 text-[11px] text-[var(--color-ink-subtle)]">{message.statusLabel}</p>
        ) : null}
      </div>
    </div>
  );
}

/** Greeting + shortcuts + suggestions, only while there are no messages yet.
 * `showQuickAccess` hides the "compromissos hoje"/atalhos block on the
 * desktop panel (narrow, and the shortcuts already live in the panel's own
 * context strip) — kept for mobile overlay and the full page, where there's
 * room and no other place for it. */
function EmptyState({
  greeting,
  conversation,
  showQuickAccess,
}: {
  greeting: Greeting;
  conversation: AssistantConversation;
  showQuickAccess: boolean;
}) {
  const { homeSummary, threads, disabled, busy, setInput, send } = conversation;
  return (
    <div className="assistant-msg-enter mx-auto flex w-full max-w-md flex-col justify-center gap-4 px-1 py-6 sm:py-10">
      <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:items-start sm:text-left">
        <span className="relative hidden h-11 w-11 shrink-0 items-center justify-center sm:flex" aria-hidden>
          <span className="assistant-orb-glow" />
          <span className="assistant-orb relative z-[1] flex h-11 w-11 items-center justify-center rounded-full">
            <IconSparkles className="h-5 w-5 text-white" />
          </span>
        </span>
        <div className="space-y-1.5">
          <p className="text-[1.65rem] font-semibold leading-tight tracking-tight text-[var(--color-ink)] sm:text-3xl">
            {greeting.headline}
            {greeting.first ? " 👋" : ""}
          </p>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ai-hover)]">
            Cronia · assistente do Croniu
          </p>
          <p className="text-sm text-[var(--color-ink-muted)] sm:text-base">
            Posso consultar seu negócio, organizar prioridades e executar ações com sua confirmação.
          </p>
          <p className="inline-flex items-center justify-center gap-1.5 text-xs text-[var(--color-ink-subtle)] sm:justify-start">
            <IconShieldCheck className="h-3.5 w-3.5 shrink-0 text-[var(--color-success)]" aria-hidden />
            Nada é alterado sem sua confirmação.
          </p>
        </div>
      </div>

      {showQuickAccess ? (
        <>
          {homeSummary ? (
            <Link
              href="/app/agenda"
              className="flex items-center justify-between gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-3"
            >
              <span className="text-sm text-[var(--color-ink)]">
                <strong className="font-semibold">{homeSummary.today_appointments.length}</strong>{" "}
                compromisso(s) hoje
                {homeSummary.attention_items && homeSummary.attention_items.length > 0
                  ? ` · ${homeSummary.attention_items.length} pedindo atenção`
                  : ""}
              </span>
              <span className="shrink-0 text-xs font-medium text-[var(--color-link)]">Ver agenda</span>
            </Link>
          ) : null}

          <div role="group" aria-label="Acesso rápido" className="flex flex-wrap justify-center gap-2">
            {[
              { href: "/app/agenda", label: "Agenda", Icon: IconCalendarDays },
              { href: "/app/clients", label: "Clientes", Icon: IconUsersRound },
              { href: "/app/routines/pending", label: "Rotinas", Icon: IconClipboardList },
            ].map(({ href, label, Icon }) => (
              <Link
                key={href}
                href={href}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs font-semibold text-[var(--color-ink)]"
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {label}
              </Link>
            ))}
          </div>

          {threads.length > 0 ? (
            <div>
              <p className="mb-1.5 text-center text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-subtle)] sm:text-left">
                Consultas recentes
              </p>
              <ul className="flex flex-wrap justify-center gap-1.5 sm:justify-start">
                {threads.slice(0, 3).map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => void conversation.openThread(t.id)}
                      className="max-w-[12rem] truncate rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-ink)]"
                    >
                      {t.title || "Conversa"}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}

      <SuggestionGrid
        items={showQuickAccess ? ASSISTANT_SUGGESTIONS : ASSISTANT_SUGGESTIONS.slice(0, 3)}
        disabled={disabled || busy}
        onPick={(prompt) => {
          setInput(prompt);
          void send(prompt);
        }}
      />
    </div>
  );
}

/** The scrollable transcript — empty state, message bubbles, typing
 * indicator, error line, and the "jump to bottom" affordance. Same
 * component for the full page, the desktop panel, and the mobile overlay;
 * `showQuickAccess` is the only layout-driven difference. */
export function MessageList({
  conversation,
  greeting,
  showQuickAccess,
}: {
  conversation: AssistantConversation;
  greeting: Greeting;
  showQuickAccess: boolean;
}) {
  const {
    messages,
    busy,
    recording,
    error,
    pending,
    empty,
    scrollToBottom,
    onTranscriptScroll,
    showJump,
  } = conversation;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        data-assistant-scroll-container=""
        className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4"
        onScroll={onTranscriptScroll}
      >
        <div className="mx-auto flex w-full max-w-[720px] flex-col gap-3">
          {empty ? (
            <EmptyState greeting={greeting} conversation={conversation} showQuickAccess={showQuickAccess} />
          ) : null}

          {messages.map((m, idx) => (
            <MessageBubble
              key={m.id || `${m.role}-${idx}`}
              message={m}
              busy={busy}
              pendingId={pending?.id || null}
              onConfirm={(p) => void conversation.confirmPending(p)}
              onCancel={(p) => void conversation.cancelPending(p)}
            />
          ))}

          {busy && !recording ? <TypingIndicator /> : null}

          {error ? (
            <p className="text-sm text-[var(--color-danger)]" role="alert">
              {error}
            </p>
          ) : null}
          <div data-assistant-bottom-sentinel="" className="h-2" />
        </div>
      </div>

      {showJump ? (
        <button
          type="button"
          className="absolute bottom-3 left-1/2 z-10 inline-flex min-h-11 -translate-x-1/2 items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs font-semibold text-[var(--color-ink)] shadow-md"
          onClick={() => scrollToBottom()}
        >
          Ir para o final
          <IconChevronDown className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
