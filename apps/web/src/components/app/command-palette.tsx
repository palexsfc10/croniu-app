"use client";

/**
 * Global Ctrl+K / Cmd+K quick-query palette — the fast path for a single
 * consulta ou ação rápida, deliberately shallow (no thread switcher, no
 * history, no voice). The full Assistente page is where conversation,
 * history and richer operations live; this component only ever shows the
 * latest turn. It calls the same `/agent/chat` "convenience" endpoint the
 * backend already exposes for exactly this — it transparently reuses the
 * user's latest active thread, so anything asked here also shows up in the
 * Assistente page's history afterwards.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { IconSend, IconSparkles, IconX } from "@/components/ui/icons";
import { ProposalCard } from "@/components/app/assistant/proposal-card";
import type { ActionUiStatus, AgentChatResponse, PendingAction } from "@/components/app/assistant/types";

function newClientMessageId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `cmdk-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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
  return "pending";
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [actionStatus, setActionStatus] = useState<ActionUiStatus>("pending");
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const isCombo = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (isCombo) {
        event.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (event.key === "Escape" && open) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 10);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  async function submit() {
    const trimmed = query.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    setReply(null);
    setPending(null);
    const clientMessageId = newClientMessageId();
    const result = await apiFetch<AgentChatResponse>("/api/v1/agent/chat", {
      method: "POST",
      headers: { "X-Request-Id": clientMessageId },
      body: JSON.stringify({ message: trimmed, client_message_id: clientMessageId }),
    });
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    const data = result.data!;
    setReply(data.reply);
    setQuery("");
    if (data.pending_action) {
      setPending({ ...data.pending_action, status: data.pending_action.status || "pending" });
      setActionStatus("pending");
    }
  }

  async function confirm() {
    if (!pending || busy) return;
    setBusy(true);
    setActionStatus("executing");
    const confirmationKey =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `confirm-${pending.id}-${Date.now()}`;
    const result = await apiFetch<AgentChatResponse>(`/api/v1/agent/pending/${pending.id}/confirm`, {
      method: "POST",
      headers: { "X-Request-Id": confirmationKey },
      body: JSON.stringify({ arguments: pending.arguments, confirmation_key: confirmationKey }),
    });
    setBusy(false);
    if (result.error) {
      const details = result.error.details as { action_status?: string } | undefined;
      setActionStatus(mapActionStatus(details?.action_status) === "pending" ? "failed" : mapActionStatus(details?.action_status));
      setError(result.error.message);
      return;
    }
    const data = result.data!;
    setActionStatus(mapActionStatus(data.action_status || data.status || "executed"));
    setReply(data.reply);
  }

  async function cancel() {
    if (!pending || busy) return;
    setBusy(true);
    const result = await apiFetch<AgentChatResponse>(`/api/v1/agent/pending/${pending.id}/cancel`, {
      method: "POST",
    });
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setActionStatus("cancelled");
    setReply(result.data?.reply || "Ação cancelada.");
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-[var(--color-ink)]/45 p-4 pt-[12vh]">
      <div
        ref={rootRef}
        role="dialog"
        aria-modal="true"
        aria-label="Consulta rápida ao Assistente"
        className="w-full max-w-lg overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-md"
      >
        <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3.5 py-3">
          <IconSparkles className="h-4 w-4 shrink-0 text-[var(--color-ai)]" aria-hidden />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submit();
              }
            }}
            placeholder="Pergunte ou peça algo rápido…"
            aria-label="Consulta rápida"
            disabled={busy}
            className="min-w-0 flex-1 bg-transparent text-sm text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-subtle)]"
          />
          <button
            type="button"
            aria-label="Fechar"
            className="min-h-8 min-w-8 rounded-[var(--radius-md)] text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-subtle)]"
            onClick={() => setOpen(false)}
          >
            <IconX className="mx-auto h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="max-h-[50vh] overflow-y-auto px-3.5 py-3">
          {!reply && !pending && !error ? (
            <p className="text-sm text-[var(--color-ink-subtle)]">
              Consulta ou ação rápida — para conversa completa e histórico, abra a página
              Assistente.
            </p>
          ) : null}
          {busy && !reply ? (
            <p className="text-sm text-[var(--color-ink-muted)]" role="status">
              Consultando…
            </p>
          ) : null}
          {error ? (
            <p className="text-sm text-[var(--color-danger)]" role="alert">
              {error}
            </p>
          ) : null}
          {reply ? <p className="text-sm text-[var(--color-ink)]">{reply}</p> : null}
          {pending ? (
            <ProposalCard
              pending={pending}
              actionStatus={actionStatus}
              busy={busy}
              onConfirm={() => void confirm()}
              onCancel={() => void cancel()}
            />
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-[var(--color-border)] px-3.5 py-2.5">
          <Link
            href="/app/assistant"
            onClick={() => setOpen(false)}
            className="text-xs font-medium text-[var(--color-link)]"
          >
            Abrir Assistente completo
          </Link>
          <button
            type="button"
            className="inline-flex min-h-8 items-center gap-1 rounded-[var(--radius-md)] px-2.5 text-xs font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary-subtle)] disabled:opacity-50"
            disabled={!query.trim() || busy}
            onClick={() => void submit()}
          >
            Enviar
            <IconSend className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
