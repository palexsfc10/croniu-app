"use client";

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
  const fields = pending.summary_fields ? Object.entries(pending.summary_fields) : [];
  const interactive = actionStatus === "pending" && !busy;
  const title = proposalTitle(pending.tool_name, pending.summary);

  return (
    <div
      role="region"
      aria-label={`Proposta: ${title}`}
      className={[
        "mt-2 w-full max-w-md overflow-hidden rounded-[var(--radius-lg)] border shadow-[var(--shadow-sm)]",
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
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{pending.summary}</p>
        </div>
      </div>

      {fields.length ? (
        <dl className="space-y-2 px-3.5 py-3 text-sm">
          {fields.map(([key, value]) => (
            <div key={key} className="grid grid-cols-[minmax(0,38%)_1fr] gap-2">
              <dt className="font-medium text-[var(--color-ink-muted)]">{key}</dt>
              <dd className="font-medium text-[var(--color-ink)]">{String(value)}</dd>
            </div>
          ))}
        </dl>
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
