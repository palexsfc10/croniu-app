"use client";

import { formatThreadWhen, type Thread } from "./types";

/** One row in the conversation history — used both in the desktop sidebar
 * (always visible) and the mobile/panel dropdown (toggled). */
export function ThreadRow({
  thread,
  active,
  onOpen,
}: {
  thread: Thread;
  active: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={[
        "w-full rounded-[var(--radius-md)] px-2.5 py-2 text-left",
        active ? "bg-[var(--color-primary-subtle)]" : "hover:bg-[var(--color-surface-subtle)]",
      ].join(" ")}
    >
      <span
        className={[
          "block truncate text-sm",
          active ? "font-semibold text-[var(--color-ink)]" : "text-[var(--color-ink-muted)]",
        ].join(" ")}
      >
        {thread.title || "Conversa"}
      </span>
      <span className="mt-0.5 block text-[11px] text-[var(--color-ink-subtle)]">
        {formatThreadWhen(thread.updated_at)}
      </span>
    </button>
  );
}

export function ThreadsList({
  threads,
  activeThreadId,
  onOpen,
  emptyLabel = "Nenhuma conversa ainda",
}: {
  threads: Thread[];
  activeThreadId: string | null;
  onOpen: (id: string) => void;
  emptyLabel?: string;
}) {
  if (threads.length === 0) {
    return <p className="px-2.5 py-3 text-sm text-[var(--color-ink-muted)]">{emptyLabel}</p>;
  }
  return (
    <ul className="space-y-0.5">
      {threads.map((t) => (
        <li key={t.id}>
          <ThreadRow thread={t} active={t.id === activeThreadId} onOpen={() => onOpen(t.id)} />
        </li>
      ))}
    </ul>
  );
}
