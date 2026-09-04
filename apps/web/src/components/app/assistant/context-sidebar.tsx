"use client";

import Link from "next/link";
import {
  IconActivity,
  IconCalendarDays,
  IconCalendarPlus,
  IconClipboardList,
  IconUsersRound,
} from "@/components/ui/icons";
import { actionHeadline, proposalTitle } from "./types";
import type { AssistantConversation } from "./use-assistant-conversation";

/** Only the tool-result "kind"s that map to a real, single-record detail
 * route get a link — anything else still shows in "Atividade recente" but
 * without a link, rather than guessing a route that doesn't exist. */
function resolveResultLink(kind: unknown, id: unknown): string | null {
  if (typeof id !== "string" || !id) return null;
  switch (kind) {
    case "client":
      return `/app/clients/${id}`;
    case "appointment":
      return `/app/appointments/${id}`;
    case "cycle":
      return `/app/cycles/${id}`;
    case "receivable":
      return `/app/receivables/${id}`;
    default:
      return null;
  }
}

const SHORTCUTS = [
  { href: "/app/agenda", label: "Agenda completa", Icon: IconCalendarDays },
  { href: "/app/appointments/new", label: "Novo compromisso", Icon: IconCalendarPlus },
  { href: "/app/clients", label: "Clientes", Icon: IconUsersRound },
  { href: "/app/routines/pending", label: "Rotinas pendentes", Icon: IconClipboardList },
  { href: "/app/accompaniment", label: "Avaliações pendentes", Icon: IconActivity },
];

/** Desktop-only right column: current context + shortcuts + recent
 * activity — fills the width instead of leaving it empty next to a narrow
 * centered transcript. Nothing here is a separate data store: context is a
 * display-only label from whoever opened the conversation, recent activity
 * reads the already-loaded thread messages, shortcuts are static real
 * routes. Full page only — the desktop panel is too narrow for this. */
export function ContextSidebar({ conversation }: { conversation: AssistantConversation }) {
  const { contextLabel, contextReturnTo, recentActivity } = conversation;
  return (
    <aside
      aria-label="Painel lateral da Cronia"
      className="hidden w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l border-[var(--color-border)]/70 bg-[var(--color-surface)]/60 p-4 lg:flex"
    >
      {contextLabel ? (
        <section className="rounded-[var(--radius-lg)] border border-[var(--color-ai-border)] bg-[var(--color-ai-subtle)] p-3.5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ai-hover)]">
            Contexto atual
          </h2>
          <p className="mt-1 text-sm font-medium text-[var(--color-ink)]">{contextLabel}</p>
          {contextReturnTo ? (
            <Link href={contextReturnTo} className="mt-1.5 inline-block text-xs font-medium text-[var(--color-link)]">
              Voltar
            </Link>
          ) : null}
        </section>
      ) : null}

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">Atalhos</h2>
        <ul className="mt-2 space-y-1">
          {SHORTCUTS.map(({ href, label, Icon }) => (
            <li key={href}>
              <Link
                href={href}
                className="flex min-h-10 items-center gap-2 rounded-[var(--radius-md)] px-2 text-sm text-[var(--color-ink)] hover:bg-[var(--color-surface-subtle)]"
              >
                <Icon className="h-4 w-4 shrink-0 text-[var(--color-ink-subtle)]" aria-hidden />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
          Atividade recente
        </h2>
        {recentActivity.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--color-ink-subtle)]">
            Ações confirmadas nesta conversa aparecem aqui.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {recentActivity.map((m, idx) => {
              const link = resolveResultLink(m.pending?.result?.kind, m.pending?.result?.id);
              const title = m.pending ? proposalTitle(m.pending.tool_name, m.pending.summary) : "";
              return (
                <li key={m.pending?.id || idx} className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-2.5 py-2">
                  <p className="text-sm font-medium text-[var(--color-ink)]">{title}</p>
                  <p className="text-xs text-[var(--color-ink-subtle)]">{actionHeadline(m.actionStatus || "executed")}</p>
                  {link ? (
                    <Link href={link} className="text-xs font-medium text-[var(--color-link)]">
                      Abrir registro
                    </Link>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </aside>
  );
}
