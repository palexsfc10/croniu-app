"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { IconChevronDown, IconChevronLeft, IconMinus, IconPlus, IconX } from "@/components/ui/icons";
import { ThreadsList } from "./threads-list";
import type { AssistantConversation } from "./use-assistant-conversation";

export type AssistantLayout = "page" | "panel" | "overlay";

/**
 * Header bar — "Assistente Croniu", the conversation-history trigger, "Nova
 * conversa", and (panel/overlay only) minimize/close. `layout="page"` keeps
 * a real back-link (there's a place to go back to); `panel`/`overlay` never
 * navigate — they're a layer over whatever page is already showing, so
 * minimize/close hide the layer instead.
 */
export function AssistantHeader({
  layout,
  conversation,
  onMinimize,
  onClose,
}: {
  layout: AssistantLayout;
  conversation: AssistantConversation;
  onMinimize?: () => void;
  onClose?: () => void;
}) {
  const {
    threadsTriggerRef,
    threadsPanelRef,
    threads,
    threadId,
    threadsOpen,
    setThreadsOpen,
    setMicMenuOpen,
    startNewThread,
    openThread,
  } = conversation;

  return (
    <header className="relative z-20 flex shrink-0 items-center gap-1 border-b border-[var(--color-border)]/60 bg-[var(--color-surface)]/95 px-2 py-1.5 sm:px-3">
      {layout === "page" ? (
        <Link
          href="/app"
          aria-label="Voltar"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-ink)] hover:bg-[var(--color-surface-subtle)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
        >
          <IconChevronLeft className="h-5 w-5" aria-hidden />
        </Link>
      ) : null}
      <h1 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight text-[var(--color-ink)]">
        Assistente Croniu
      </h1>
      <div className={layout === "page" ? "relative lg:hidden" : "relative"}>
        <button
          ref={threadsTriggerRef}
          type="button"
          className="btn-ghost inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-md)] px-2"
          aria-label="Conversas"
          aria-expanded={threadsOpen}
          aria-haspopup="dialog"
          onClick={() => {
            setMicMenuOpen(false);
            setThreadsOpen(!threadsOpen);
          }}
        >
          <IconChevronDown className={["h-5 w-5 transition-transform", threadsOpen ? "rotate-180" : ""].join(" ")} />
        </button>
      </div>
      <Button
        type="button"
        variant="ghost"
        className="min-h-11 min-w-11 px-2"
        aria-label="Nova conversa"
        onClick={() => startNewThread()}
      >
        <IconPlus className="h-5 w-5" />
      </Button>
      {layout !== "page" ? (
        <>
          <IconButton
            icon={<IconMinus className="h-5 w-5" />}
            aria-label="Minimizar Assistente"
            variant="ghost"
            onClick={onMinimize}
          />
          <IconButton
            icon={<IconX className="h-5 w-5" />}
            aria-label="Fechar Assistente"
            variant="ghost"
            onClick={onClose}
          />
        </>
      ) : null}

      {threadsOpen ? (
        <div
          ref={threadsPanelRef}
          role="dialog"
          aria-label="Conversas recentes"
          className={[
            "absolute left-2 right-2 top-full z-30 mt-1 max-h-[min(20rem,55vh)] overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-md",
            layout === "page" ? "lg:hidden" : "",
          ].join(" ")}
        >
          <button
            type="button"
            className="mb-1 flex w-full min-h-11 items-center gap-2 rounded-[var(--radius-md)] px-2.5 py-2 text-left text-sm font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary-subtle)]"
            onClick={() => {
              setThreadsOpen(false);
              startNewThread();
            }}
          >
            <IconPlus className="h-4 w-4" aria-hidden />
            Nova conversa
          </button>
          <ThreadsList threads={threads} activeThreadId={threadId} onOpen={(id) => void openThread(id)} />
        </div>
      ) : null}
    </header>
  );
}
