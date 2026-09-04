"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, formatDateBR, type RenewalCaseView } from "@/lib/api";
import { BackLink } from "@/components/app/back-link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockError } from "@/components/ui/block-error";
import { IconSparkles } from "@/components/ui/icons";
import { PageTitle } from "@/components/ui/page-title";
import {
  AwaitingClientSheet,
  EndWithoutRenewalSheet,
} from "@/components/app/renewal-action-sheets";
import {
  RESOLUTION_REASON_LABEL,
  isNeedsDecisionStatus,
  renewalStatusLabel,
  renewalStatusTone,
  sortRenewalCases,
} from "@/lib/renewal-status";

type Scope = "needs_decision" | "all";
type StatusFilter = "all" | RenewalCaseView["display_status"];

function assistantHref(prompt: string) {
  return `/app/assistant?prompt=${encodeURIComponent(prompt)}&context=${encodeURIComponent("Renovações")}&returnTo=${encodeURIComponent("/app/renewals")}`;
}

function renewHref(row: RenewalCaseView): string {
  const params = new URLSearchParams({
    clientId: row.client_id,
    renewedFrom: row.source_cycle_id,
  });
  return `/app/cycles/new?${params.toString()}`;
}

export default function RenewalsPage() {
  const [scope, setScope] = useState<Scope>("needs_decision");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [rows, setRows] = useState<RenewalCaseView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [awaitingTarget, setAwaitingTarget] = useState<RenewalCaseView | null>(null);
  const [endTarget, setEndTarget] = useState<RenewalCaseView | null>(null);

  async function load(nextScope: Scope) {
    setRows(null);
    setError(null);
    const result = await apiFetch<RenewalCaseView[]>(
      `/api/v1/renewal-cases?scope=${nextScope}`,
    );
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setRows(sortRenewalCases(result.data ?? []));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- remote hydrate
    void load(scope);
  }, [scope]);

  function applyUpdatedRow(updated: RenewalCaseView) {
    setRows((prev) => {
      if (!prev) return prev;
      const withoutTarget = prev.filter((r) => r.source_cycle_id !== updated.source_cycle_id);
      const next = isNeedsDecisionStatus(updated.display_status) || scope === "all"
        ? [...withoutTarget, updated]
        : withoutTarget;
      return sortRenewalCases(next);
    });
  }

  const filtered = useMemo(() => {
    if (!rows) return null;
    if (statusFilter === "all") return rows;
    return rows.filter((r) => r.display_status === statusFilter);
  }, [rows, statusFilter]);

  const counts = useMemo(() => {
    const c: Partial<Record<RenewalCaseView["display_status"], number>> = {};
    for (const r of rows ?? []) c[r.display_status] = (c[r.display_status] ?? 0) + 1;
    return c;
  }, [rows]);

  const statusOptions: { value: StatusFilter; label: string }[] =
    scope === "needs_decision"
      ? [
          { value: "all", label: "Todas" },
          { value: "overdue", label: `Atrasada${counts.overdue ? ` · ${counts.overdue}` : ""}` },
          {
            value: "awaiting_client",
            label: `Aguardando${counts.awaiting_client ? ` · ${counts.awaiting_client}` : ""}`,
          },
          { value: "pending", label: `Pendente${counts.pending ? ` · ${counts.pending}` : ""}` },
          { value: "upcoming", label: `Próxima${counts.upcoming ? ` · ${counts.upcoming}` : ""}` },
        ]
      : [
          { value: "all", label: "Todas" },
          { value: "overdue", label: "Atrasada" },
          { value: "awaiting_client", label: "Aguardando" },
          { value: "pending", label: "Pendente" },
          { value: "upcoming", label: "Próxima" },
          { value: "renewed", label: "Renovada" },
          { value: "ended_without_renewal", label: "Encerrada" },
        ];

  return (
    <div className="space-y-5 animate-fade-up">
      <BackLink href="/app" label="Início" />
      <header className="space-y-1">
        <PageTitle>Renovações</PageTitle>
        <p className="text-sm text-[var(--color-ink-muted)]">
          O processo de renovação de cada cliente — separado do status do ciclo.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div
          role="tablist"
          aria-label="Escopo"
          className="inline-flex gap-0.5 rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] p-0.5"
        >
          {(
            [
              { value: "needs_decision" as const, label: "Exige decisão" },
              { value: "all" as const, label: "Histórico completo" },
            ]
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="tab"
              aria-selected={scope === opt.value}
              className="min-h-9 rounded-[10px] px-3 text-sm font-medium text-[var(--color-ink-muted)] aria-selected:bg-[var(--color-surface)] aria-selected:text-[var(--color-ink)] aria-selected:shadow-sm"
              onClick={() => {
                setScope(opt.value);
                setStatusFilter("all");
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <Link
          href={assistantHref("Quais renovações precisam da minha decisão agora?")}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[var(--color-ai-border)] bg-[var(--color-ai-subtle)] px-3 text-sm font-medium text-[var(--color-ai-hover)]"
        >
          <IconSparkles className="h-4 w-4" aria-hidden />
          Perguntar à IA
        </Link>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Situação">
        {statusOptions.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={statusFilter === opt.value}
            className={`min-h-9 rounded-full px-3 text-sm font-semibold ${
              statusFilter === opt.value
                ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                : "border border-[var(--color-border)] text-[var(--color-ink-muted)]"
            }`}
            onClick={() => setStatusFilter(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {error ? <BlockError message={error} onRetry={() => void load(scope)} /> : null}

      {rows === null && !error ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : null}

      {filtered && filtered.length === 0 ? (
        <EmptyState
          title={scope === "needs_decision" ? "Nada exige decisão agora" : "Nenhum registro"}
          description={
            scope === "needs_decision"
              ? "Nenhum ciclo próximo, pendente, aguardando cliente ou atrasado."
              : "Altere os filtros para ver outro período."
          }
        />
      ) : null}

      {filtered && filtered.length > 0 ? (
        <>
          {/* Desktop: tabela densa com todas as colunas reais. */}
          <div className="hidden overflow-hidden overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-border)]/80 bg-[var(--color-surface)] shadow-sm lg:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]/60 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
                  <th className="px-3.5 py-2.5">Cliente</th>
                  <th className="px-3.5 py-2.5">Serviço</th>
                  <th className="px-3.5 py-2.5">Data final</th>
                  <th className="px-3.5 py-2.5">Situação</th>
                  <th className="px-3.5 py-2.5">Próxima ação/data</th>
                  <th className="px-3.5 py-2.5">Origem</th>
                  <th className="px-3.5 py-2.5">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.source_cycle_id}
                    className="border-b border-[var(--color-border)]/60 align-top hover:bg-[var(--color-surface-subtle)]"
                  >
                    <td className="px-3.5 py-2.5 font-medium text-[var(--color-ink)]">
                      <Link href={`/app/clients/${row.client_id}?tab=plano`} className="hover:underline">
                        {row.client_name || "Cliente"}
                      </Link>
                    </td>
                    <td className="px-3.5 py-2.5 text-[var(--color-ink-muted)]">
                      {row.service_name || "—"}
                    </td>
                    <td className="px-3.5 py-2.5 tabular-nums text-[var(--color-ink-muted)]">
                      {formatDateBR(row.ends_on)}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <Badge tone={renewalStatusTone(row.display_status)}>
                        {renewalStatusLabel(row.display_status)}
                      </Badge>
                    </td>
                    <td className="px-3.5 py-2.5 text-[var(--color-ink-muted)]">
                      {row.display_status === "awaiting_client" && row.next_contact_date
                        ? `Contato em ${formatDateBR(row.next_contact_date)}`
                        : row.display_status === "ended_without_renewal" && row.resolution_reason
                          ? RESOLUTION_REASON_LABEL[row.resolution_reason]
                          : row.display_status === "renewed"
                            ? "Ciclo criado"
                            : "—"}
                    </td>
                    <td className="px-3.5 py-2.5">
                      {row.portal_requested ? (
                        <Badge tone="warning">Cliente pediu</Badge>
                      ) : (
                        <span className="text-[var(--color-ink-subtle)]">—</span>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <RowActions
                        row={row}
                        onAwaitingClient={() => setAwaitingTarget(row)}
                        onEndWithoutRenewal={() => setEndTarget(row)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cartões resumidos, nunca a tabela comprimida. */}
          <ul className="space-y-2.5 lg:hidden">
            {filtered.map((row) => (
              <li
                key={row.source_cycle_id}
                className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-3 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/app/clients/${row.client_id}?tab=plano`}
                    className="font-semibold text-[var(--color-ink)] hover:underline"
                  >
                    {row.client_name || "Cliente"}
                  </Link>
                  <Badge tone={renewalStatusTone(row.display_status)}>
                    {renewalStatusLabel(row.display_status)}
                  </Badge>
                </div>
                <p className="text-sm text-[var(--color-ink-muted)]">
                  {row.service_name || "Serviço"} · termina {formatDateBR(row.ends_on)}
                  {row.portal_requested ? " · cliente pediu renovação" : ""}
                </p>
                {row.display_status === "awaiting_client" && row.next_contact_date ? (
                  <p className="text-sm text-[var(--color-ink-muted)]">
                    Próximo contato: {formatDateBR(row.next_contact_date)}
                  </p>
                ) : null}
                <RowActions
                  row={row}
                  onAwaitingClient={() => setAwaitingTarget(row)}
                  onEndWithoutRenewal={() => setEndTarget(row)}
                  stacked
                />
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <AwaitingClientSheet
        open={awaitingTarget !== null}
        onClose={() => setAwaitingTarget(null)}
        cycleId={awaitingTarget?.source_cycle_id ?? ""}
        clientName={awaitingTarget?.client_name ?? null}
        onDone={applyUpdatedRow}
      />
      <EndWithoutRenewalSheet
        open={endTarget !== null}
        onClose={() => setEndTarget(null)}
        cycleId={endTarget?.source_cycle_id ?? ""}
        clientName={endTarget?.client_name ?? null}
        onDone={applyUpdatedRow}
      />
    </div>
  );
}

function RowActions({
  row,
  onAwaitingClient,
  onEndWithoutRenewal,
  stacked = false,
}: {
  row: RenewalCaseView;
  onAwaitingClient: () => void;
  onEndWithoutRenewal: () => void;
  stacked?: boolean;
}) {
  if (row.display_status === "renewed") {
    return row.successor_cycle_id ? (
      <Link
        href={`/app/cycles/${row.successor_cycle_id}`}
        className="text-sm font-medium text-[var(--color-link)] hover:underline"
      >
        Ver ciclo renovado
      </Link>
    ) : null;
  }
  if (row.display_status === "ended_without_renewal") {
    return <span className="text-sm text-[var(--color-ink-subtle)]">Encerrada</span>;
  }
  const wrapClass = stacked ? "flex flex-wrap gap-2" : "flex flex-wrap gap-2";
  return (
    <div className={wrapClass}>
      <Link href={renewHref(row)}>
        <Button className={stacked ? "min-h-9 px-3 text-sm" : "min-h-8 px-2.5 text-xs"}>
          Preparar renovação
        </Button>
      </Link>
      <Button
        variant="secondary"
        className={stacked ? "min-h-9 px-3 text-sm" : "min-h-8 px-2.5 text-xs"}
        onClick={onAwaitingClient}
      >
        Aguardando cliente
      </Button>
      <Button
        variant="secondary"
        className={stacked ? "min-h-9 px-3 text-sm" : "min-h-8 px-2.5 text-xs"}
        onClick={onEndWithoutRenewal}
      >
        Encerrar sem renovar
      </Button>
    </div>
  );
}
