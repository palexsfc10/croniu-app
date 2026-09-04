"use client";

import { Button } from "@/components/ui/button";
import { IconPlus } from "@/components/ui/icons";
import { AssistantHeader, type AssistantLayout } from "./assistant-header";
import { Composer } from "./composer";
import { ContextSidebar } from "./context-sidebar";
import { MessageList } from "./message-list";
import { ThreadsList } from "./threads-list";
import type { AssistantConversation } from "./use-assistant-conversation";
import type { personalGreeting } from "@/lib/greeting";

type Greeting = ReturnType<typeof personalGreeting>;

/**
 * The one assistant UI — header, thread history, transcript, composer,
 * context sidebar. `layout` is the only thing that changes what renders:
 * "page" gets the persistent desktop thread sidebar and the right-hand
 * context column (there's room); "panel" (desktop slide-over) and
 * "overlay" (mobile full-screen) drop both — narrower surfaces, and the
 * header's own history dropdown already covers threads. Every layout
 * renders against the same `AssistantConversation` — no branch here
 * re-implements sending, confirming, or voice.
 */
export function AssistantExperience({
  layout,
  conversation,
  greeting,
  onMinimize,
  onClose,
}: {
  layout: AssistantLayout;
  conversation: AssistantConversation;
  greeting: Greeting;
  onMinimize?: () => void;
  onClose?: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-[linear-gradient(180deg,var(--color-bg)_0%,var(--color-surface-subtle)_55%,var(--color-bg)_100%)] lg:flex-row">
      {layout === "page" ? (
        <aside className="hidden w-60 shrink-0 flex-col border-r border-[var(--color-border)]/70 bg-[var(--color-surface)]/80 lg:flex">
          <div className="flex items-center justify-between gap-2 px-3 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
              Conversas
            </h2>
            <Button
              type="button"
              variant="ghost"
              className="min-h-9 min-w-9 px-2"
              aria-label="Nova conversa"
              onClick={() => conversation.startNewThread()}
            >
              <IconPlus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-3">
            <ThreadsList
              threads={conversation.threads}
              activeThreadId={conversation.threadId}
              onOpen={(id) => void conversation.openThread(id)}
            />
          </div>
        </aside>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <AssistantHeader layout={layout} conversation={conversation} onMinimize={onMinimize} onClose={onClose} />
        <MessageList conversation={conversation} greeting={greeting} showQuickAccess={layout !== "panel"} />
        <Composer conversation={conversation} />
      </div>

      {layout === "page" ? <ContextSidebar conversation={conversation} /> : null}
    </div>
  );
}
