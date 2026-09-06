"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { IconCalendarPlus, IconUser, IconSparkles } from "@/components/ui/icons";
import {
  actionHeadline,
  proposalTitle,
  type ActionUiStatus,
  type PendingAction,
} from "./types";

function ProposalIcon({ toolName }: { toolName: string }) {
  if (toolName.includes("client")) return <IconUser className="h-5 w-5" aria-hidden />;
  if (toolName.includes("appointment") || toolName.includes("cycle")) {
    return <IconCalendarPlus className="h-5 w-5" aria-hidden />;
  }
  return <IconSparkles className="h-5 w-5" aria-hidden />;
}

function statusTone(status: ActionUiStatus) {
  if (status === "executed") return "bg-[var(--color-success-subtle)] text-[var(--color-success)]";
  if (status === "failed" || status === "expired") {
    return "bg-[var(--color-danger-subtle)] text-[var(--color-danger)]";
  }
  if (status === "cancelled") return "bg-[var(--color-neutral-subtle)] text-[var(--color-neutral)]";
  if (status === "executing") return "bg-[var(--color-info-subtle)] text-[var(--color-info)]";
  return "bg-[var(--color-ai-subtle)] text-[var(--color-ai-hover)]";
}

// Every tool this session's backend fix touched already sends a human,
// Portuguese label as the summary_fields key (e.g. "Cliente", "Valor"). This
// only fires for a tool nobody has written a proper label for yet — turning
// a raw snake_case key into readable text instead of showing it verbatim, so
// a future tool's confirmation card never regresses to a technical dump.
function humanizeLabel(label: string): string {
  if (!/^[a-z0-9_]+$/.test(label)) return label;
  const words = label.split("_").filter(Boolean);
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// A future tool might send a nested value in summary_fields; stringifying it
// safely (instead of letting `[object Object]` slip through, or omitting the
// field entirely) keeps the "no hidden material information" guarantee even
// for shapes nobody anticipated here.
function humanizeValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function FieldValue({ label, value }: { label: string; value: unknown }) {
  const displayLabel = humanizeLabel(label);
  const displayValue = humanizeValue(value);
  const isConflict = displayLabel.toLowerCase() === "conflitos" && displayValue.toLowerCase() !== "nenhum";
  return (
    <div className="grid grid-cols-[minmax(0,34%)_1fr] gap-x-2 gap-y-0.5">
      <dt className="text-xs font-medium text-[var(--color-ink-muted)]">{displayLabel}</dt>
      <dd
        className={[
          "text-sm font-medium",
          isConflict ? "text-[var(--color-danger)]" : "text-[var(--color-ink)]",
        ].join(" ")}
      >
        {displayValue}
      </dd>
    </div>
  );
}

export function ProposalCard({
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
  const [datesOpen, setDatesOpen] = useState(false);
  const fields = pending.summary_fields ? Object.entries(pending.summary_fields) : [];
  const interactive = actionStatus === "pending" && !busy;
  const title = proposalTitle(pending.tool_name, pending.summary);
  const occurrenceDates = Array.isArray(pending.arguments?.occurrence_dates)
    ? (pending.arguments.occurrence_dates as string[])
    : [];
  const hasStructured = fields.length > 0;
  // Avoid duplicating the multi-line summary when structured fields already tell the story.
  const showSummaryBlurb = !hasStructured && Boolean(pending.summary?.trim());

  return (
    <div
      role="region"
      aria-label={`Proposta: ${title}`}
      className={[
        "mt-2 w-full max-w-md overflow-hidden rounded-[var(--radius-lg)] border shadow-sm",
        actionStatus === "failed" || actionStatus === "expired"
          ? "border-[var(--color-danger)]/25 bg-[var(--color-surface)]"
          : actionStatus === "executed"
            ? "border-[var(--color-success)]/25 bg-[var(--color-surface)]"
            : pending.risk_class === "write_sensitive"
              ? "border-[var(--color-warning)]/35 bg-[var(--color-surface)]"
              : "border-[var(--color-ai-border)] bg-[var(--color-surface)]",
      ].join(" ")}
    >
      <div className="flex items-start gap-3 border-b border-[var(--color-border)]/70 px-3.5 py-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-ai-subtle)] text-[var(--color-ai)]"
          aria-hidden
        >
          <ProposalIcon toolName={pending.tool_name} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-[var(--color-ink)]">{title}</h3>
            <span
              className={[
                "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
                statusTone(actionStatus),
              ].join(" ")}
            >
              {actionHeadline(actionStatus, pending.risk_class)}
            </span>
          </div>
          {showSummaryBlurb ? (
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{pending.summary}</p>
          ) : null}
        </div>
      </div>

      {hasStructured ? (
        <dl className="space-y-2.5 px-3.5 py-3">
          {fields.map(([key, value]) => (
            <FieldValue key={key} label={key} value={value} />
          ))}
        </dl>
      ) : null}

      {occurrenceDates.length > 0 ? (
        <div className="border-t border-[var(--color-border)]/60 px-3.5 py-2">
          <button
            type="button"
            className="min-h-11 w-full text-left text-sm font-semibold text-[var(--color-primary)] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
            aria-expanded={datesOpen}
            onClick={() => setDatesOpen((v) => !v)}
          >
            {datesOpen ? "Ocultar datas" : `Ver datas (${occurrenceDates.length})`}
          </button>
          {datesOpen ? (
            <ul className="mt-1 max-h-48 space-y-1 overflow-y-auto pb-2 text-xs text-[var(--color-ink-muted)]">
              {occurrenceDates.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {actionStatus === "pending" ? (
        <div className="flex flex-wrap gap-2 border-t border-[var(--color-border)]/70 px-3.5 py-3">
          <Button
            type="button"
            disabled={!interactive}
            onClick={onConfirm}
            className="min-h-11 min-w-[7.5rem]"
          >
            {busy ? "Confirmando…" : "Confirmar"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={!interactive}
            onClick={onCancel}
            className="min-h-11 min-w-[7.5rem]"
          >
            Cancelar
          </Button>
        </div>
      ) : null}

      {actionStatus === "executing" ? (
        <p className="border-t border-[var(--color-border)]/70 px-3.5 py-3 text-sm text-[var(--color-ink-muted)]">
          Concluindo ação…
        </p>
      ) : null}

      {actionStatus === "failed" ||
      actionStatus === "expired" ||
      actionStatus === "cancelled" ? (
        <p className="border-t border-[var(--color-border)]/70 px-3.5 py-3 text-sm text-[var(--color-ink-muted)]">
          Se ainda precisar, peça uma nova proposta na conversa.
        </p>
      ) : null}
    </div>
  );
}
