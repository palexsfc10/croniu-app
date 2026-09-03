"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, formatBRL, formatDateBR, type FinancialOverview, type Receivable } from "@/lib/api";
import { BackLink } from "@/components/app/back-link";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { receivableStatusLabel, receivableStatusTone } from "@/lib/status-tone";
import { isReceivableOverdue, isReceivablePending } from "@/lib/client-list";
import {
  isReceivableUpcoming,
  matchesReceivableView,
  receivableActionLabel,
  type ReceivableView,
} from "@/lib/financial-central";

const RETURN_TO = "/app/receivables";

const VIEWS: { id: ReceivableView; label: string }[] = [
  { id: "overdue", label: "Vencidos" },
  { id: "upcoming", label: "Vencendo" },
  { id: "pending", label: "Pendentes" },
  { id: "received", label: "Recebidos" },
  { id: "cancelled", label: "Cancelados" },
  { id: "all", label: "Todos" },
];

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, 1));
  return date.toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" }).replace(".", "");
}

function TrendChart({ trend }: { trend: FinancialOverview["monthly_trend"] }) {
  const max = Math.max(1, ...trend.map((m) => m.received_cents));
  return (
    <div aria-label="Evolução do recebido nos últimos meses" className="space-y-2">
      <h2 className="text-sm font-semibold text-[var(--color-ink-muted)]">
        Evolução do recebido
      </h2>
      <div className="flex items-end gap-2 overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-border)]/80 bg-[var(--color-surface)] p-4">
        {trend.map((m) => (
          <div key={m.month} className="flex min-w-14 flex-1 flex-col items-center gap-1.5">
            <span className="text-xs font-medium tabular-nums text-[var(--color-ink)]">
              {formatBRL(m.received_cents)}
            </span>
            <div
              className="w-full rounded-t-[var(--radius-sm)] bg-[var(--color-primary)]"
              style={{ height: `${8 + (m.received_cents / max) * 72}px` }}
              role="img"
              aria-label={`${monthLabel(m.month)}: ${formatBRL(m.received_cents)} recebidos`}
            />
            <span className="text-xs capitalize text-[var(--color-ink-muted)]">
              {monthLabel(m.month)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ReceivablesPage() {
  const [overview, setOverview] = useState<FinancialOverview | null>(null);
  const [items, setItems] = useState<Receivable[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ReceivableView>("overdue");
  const [today, setToday] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [ov, list, pref] = await Promise.all([
        apiFetch<FinancialOverview>("/api/v1/receivables/overview"),
        apiFetch<Receivable[]>("/api/v1/receivables"),
        apiFetch<{ local_today: string }>("/api/v1/organization/preferences"),
      ]);
      if (cancelled) return;
      if (ov.error) setError(ov.error.message);
      else setOverview(ov.data ?? null);
      setItems(list.data ?? []);
      if (pref.data?.local_today) setToday(pref.data.local_today);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(
    () => items.filter((r) => matchesReceivableView(r, view, today)),
    [items, view, today],
  );

  const counts = useMemo(
    () => ({
      overdue: items.filter((r) => isReceivableOverdue(r, today)).length,
      upcoming: items.filter((r) => isReceivableUpcoming(r, today)).length,
      pending: items.filter((r) => isReceivablePending(r)).length,
      received: items.filter((r) => r.status === "received").length,
      cancelled: items.filter((r) => r.status === "cancelled").length,
    }),
    [items, today],
  );

  const upcomingPreview = items.filter((r) => isReceivableUpcoming(r, today)).slice(0, 5);
  const overduePreview = items.filter((r) => isReceivableOverdue(r, today)).slice(0, 5);
  const receivedRecent = items
    .filter((r) => r.status === "received")
    .sort((a, b) => (b.paid_at || "").localeCompare(a.paid_at || ""))
    .slice(0, 5);

  const summary = overview?.summary;

  return (
    <div className="space-y-6 animate-fade-up">
      <BackLink href="/app" label="Início" />
      <div>
        <h1 className="h-display text-3xl text-[var(--color-ink)]">Financeiro</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Cobranças reais dos seus clientes, geradas pelos ciclos. A assinatura do Croniu fica em{" "}
          <Link href="/app/billing" className="font-medium text-[var(--color-link)] hover:underline">
            Assinatura
          </Link>
          .
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}

      {loading ? <p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p> : null}

      {summary ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-success)]/25 bg-[var(--color-success-subtle)]/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
              Recebido no mês
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--color-ink)]">
              {formatBRL(summary.received_month_cents)}
            </p>
          </div>
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
              Previsto no mês
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--color-ink)]">
              {formatBRL(summary.forecast_month_cents)}
            </p>
          </div>
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-danger)]/25 bg-[var(--color-danger-subtle)]/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
              Vencido
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--color-danger)]">
              {formatBRL(summary.overdue_cents)}
            </p>
            <p className="text-xs text-[var(--color-ink-muted)]">
              {summary.overdue_count} cobrança{summary.overdue_count === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      ) : null}

      {overview?.monthly_trend.length ? <TrendChart trend={overview.monthly_trend} /> : null}

      {/* Visão analítica: só no desktop — no mobile o digest abaixo já cobre o essencial */}
      <div className="hidden gap-4 lg:grid lg:grid-cols-3">
        <section aria-label="Vencidos" className="space-y-2">
          <h2 className="text-sm font-semibold text-[var(--color-ink-muted)]">Vencidos</h2>
          {overduePreview.length ? (
            <ul className="space-y-1.5">
              {overduePreview.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/app/receivables/${r.id}?returnTo=${encodeURIComponent(RETURN_TO)}`}
                    className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm hover:bg-[var(--color-surface-subtle)]"
                  >
                    <span className="truncate">{r.client_name}</span>
                    <span className="shrink-0 font-medium text-[var(--color-danger)]">
                      {formatBRL(r.amount_cents)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--color-ink-muted)]">Nenhuma cobrança vencida.</p>
          )}
        </section>
        <section aria-label="Próximos recebimentos" className="space-y-2">
          <h2 className="text-sm font-semibold text-[var(--color-ink-muted)]">
            Próximos recebimentos
          </h2>
          {upcomingPreview.length ? (
            <ul className="space-y-1.5">
              {upcomingPreview.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/app/receivables/${r.id}?returnTo=${encodeURIComponent(RETURN_TO)}`}
                    className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm hover:bg-[var(--color-surface-subtle)]"
                  >
                    <span className="truncate">
                      {r.client_name} · {formatDateBR(r.due_on)}
                    </span>
                    <span className="shrink-0 font-medium">{formatBRL(r.amount_cents)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--color-ink-muted)]">Nada vencendo nos próximos 7 dias.</p>
          )}
        </section>
        <section aria-label="Recebidos recentemente" className="space-y-2">
          <h2 className="text-sm font-semibold text-[var(--color-ink-muted)]">
            Recebidos recentemente
          </h2>
          {receivedRecent.length ? (
            <ul className="space-y-1.5">
              {receivedRecent.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/app/receivables/${r.id}?returnTo=${encodeURIComponent(RETURN_TO)}`}
                    className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm hover:bg-[var(--color-surface-subtle)]"
                  >
                    <span className="truncate">{r.client_name}</span>
                    <span className="shrink-0 font-medium text-[var(--color-success)]">
                      {formatBRL(r.amount_cents)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--color-ink-muted)]">Nenhum recebimento recente.</p>
          )}
        </section>
      </div>

      <div
        role="tablist"
        aria-label="Filtro de recebíveis"
        className="grid grid-cols-2 gap-0.5 rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] p-0.5 sm:grid-cols-6"
      >
        {VIEWS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            className="min-h-11 rounded-[10px] px-2 text-sm font-medium text-[var(--color-ink-muted)] aria-selected:bg-[var(--color-surface)] aria-selected:text-[var(--color-ink)] aria-selected:shadow-[0_1px_2px_rgba(15,15,20,0.06)]"
            onClick={() => setView(id)}
          >
            {label} {counts[id as keyof typeof counts] ?? ""}
          </button>
        ))}
      </div>

      {!loading && !visible.length ? (
        <EmptyState
          title="Nenhum recebível neste filtro"
          description="Recebíveis nascem automaticamente quando você cria um ciclo pago."
        />
      ) : null}

      {/* Desktop: tabela densa */}
      {visible.length ? (
        <div className="hidden overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)]/80 bg-[var(--color-surface)] lg:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)]/60 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
                <th className="px-3.5 py-2.5">Cliente</th>
                <th className="px-3.5 py-2.5">Serviço/Ciclo</th>
                <th className="px-3.5 py-2.5">Vencimento</th>
                <th className="px-3.5 py-2.5">Valor</th>
                <th className="px-3.5 py-2.5">Status</th>
                <th className="px-3.5 py-2.5">Recebimento</th>
                <th className="px-3.5 py-2.5">Ação</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const overdue = isReceivableOverdue(r, today);
                return (
                  <tr key={r.id} className="border-b border-[var(--color-border)]/50 last:border-b-0">
                    <td className="px-3.5 py-3 font-medium text-[var(--color-ink)]">
                      <Link href={`/app/clients/${r.client_id}?tab=financeiro`} className="hover:underline">
                        {r.client_name}
                      </Link>
                    </td>
                    <td className="px-3.5 py-3 text-[var(--color-ink-muted)]">
                      <Link href={`/app/cycles/${r.cycle_id}`} className="hover:underline">
                        {r.cycle_service_name}
                      </Link>
                    </td>
                    <td
                      className={`px-3.5 py-3 tabular-nums ${
                        overdue ? "font-medium text-[var(--color-danger)]" : "text-[var(--color-ink-muted)]"
                      }`}
                    >
                      {formatDateBR(r.due_on)}
                    </td>
                    <td className="px-3.5 py-3 tabular-nums text-[var(--color-ink)]">
                      {formatBRL(r.amount_cents)}
                    </td>
                    <td className="px-3.5 py-3">
                      <Badge tone={receivableStatusTone(r.status, overdue)}>
                        {overdue ? "Vencido" : receivableStatusLabel(r.status)}
                      </Badge>
                    </td>
                    <td className="px-3.5 py-3 text-[var(--color-ink-muted)]">
                      {r.status === "received"
                        ? `${r.paid_at ? formatDateBR(r.paid_at.slice(0, 10)) : "—"}${r.payment_method ? ` · ${r.payment_method}` : ""}`
                        : "—"}
                    </td>
                    <td className="px-3.5 py-3">
                      <Link
                        href={`/app/receivables/${r.id}?returnTo=${encodeURIComponent(RETURN_TO)}`}
                        className="font-medium text-[var(--color-primary)] hover:underline"
                      >
                        {receivableActionLabel(r)}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* Mobile: cards, nunca a tabela comprimida */}
      {visible.length ? (
        <ul className="space-y-2 lg:hidden">
          {visible.map((r) => {
            const overdue = isReceivableOverdue(r, today);
            return (
              <li
                key={r.id}
                className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[var(--color-ink)]">{r.client_name}</p>
                    <p className="truncate text-sm text-[var(--color-ink-muted)]">
                      {r.cycle_service_name}
                    </p>
                  </div>
                  <Badge tone={receivableStatusTone(r.status, overdue)}>
                    {overdue ? "Vencido" : receivableStatusLabel(r.status)}
                  </Badge>
                </div>
                <p className="mt-1.5 text-sm">
                  <span className={overdue ? "font-medium text-[var(--color-danger)]" : "text-[var(--color-ink-muted)]"}>
                    {formatDateBR(r.due_on)}
                  </span>{" "}
                  · <span className="font-medium tabular-nums text-[var(--color-ink)]">{formatBRL(r.amount_cents)}</span>
                </p>
                <div className="mt-2 flex flex-wrap gap-3">
                  <Link
                    href={`/app/receivables/${r.id}?returnTo=${encodeURIComponent(RETURN_TO)}`}
                    className="text-sm font-medium text-[var(--color-primary)]"
                  >
                    {receivableActionLabel(r)}
                  </Link>
                  <Link
                    href={`/app/clients/${r.client_id}?tab=financeiro`}
                    className="text-sm font-medium text-[var(--color-link)]"
                  >
                    Abrir cliente
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      <Link
        href="/app/assistant"
        className="block rounded-[var(--radius-lg)] border border-[var(--color-primary)]/30 bg-[var(--color-primary-subtle)]/40 px-3.5 py-3 text-sm font-semibold text-[var(--color-ink)] lg:hidden"
      >
        Perguntar ao Assistente sobre o financeiro
      </Link>
    </div>
  );
}
