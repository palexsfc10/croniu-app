"use client";

/**
 * Acompanhamentos — client-evolution check-ins (backed by `ClientEvaluation`).
 * Distinct from Rotinas (`/app/routines`, task reminders) and from the
 * client-onboarding "Preparar acompanhamento" checklist nested under
 * `/app/clients/[clientId]/accompaniment` (a different, pre-existing
 * concept — see `backend/app/services/client_evolution.py` for the naming
 * note). "Pendentes" here is a real, derived signal (active cycle + no
 * recent evaluation) — never a persisted/invented flag.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconClipboardList, IconHistory, IconUser } from "@/components/ui/icons";
import { BackLink } from "@/components/app/back-link";

type PendingRow = {
  client_id: string;
  client_name: string;
  cycle_id: string | null;
  service_name: string | null;
  last_evaluation_at: string | null;
  days_since_last_evaluation: number | null;
  next_appointment_at: string | null;
};

type RecentEvaluation = {
  id: string;
  client_id: string;
  title: string;
  published_at: string | null;
  created_at: string;
  status: string;
};

function formatDatePt(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", { timeZone, day: "2-digit", month: "2-digit", year: "numeric" }).format(
      new Date(iso),
    );
  } catch {
    return iso.slice(0, 10);
  }
}

function PendingRowView({ row, timeZone }: { row: PendingRow; timeZone: string }) {
  const returnTo = "/app/accompaniment";
  return (
    <>
      <td className="py-2.5 pr-3 font-medium text-[var(--color-ink)]">
        <Link href={`/app/clients/${row.client_id}`} className="hover:underline">
          {row.client_name}
        </Link>
      </td>
      <td className="py-2.5 pr-3 text-[var(--color-ink-muted)]">{row.service_name || "—"}</td>
      <td className="py-2.5 pr-3 text-[var(--color-ink-muted)]">
        {row.last_evaluation_at ? formatDatePt(row.last_evaluation_at, timeZone) : "Nunca"}
      </td>
      <td className="py-2.5 pr-3 tabular-nums">
        {row.days_since_last_evaluation == null ? (
          <Badge tone="danger">Nunca acompanhado</Badge>
        ) : (
          <Badge tone={row.days_since_last_evaluation >= 30 ? "danger" : "warning"}>
            {row.days_since_last_evaluation} dias
          </Badge>
        )}
      </td>
      <td className="py-2.5 pr-3 text-[var(--color-ink-muted)]">
        {row.next_appointment_at ? formatDatePt(row.next_appointment_at, timeZone) : "—"}
      </td>
      <td className="py-2.5 pr-3">
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/app/clients/${row.client_id}/evaluations/new?returnTo=${encodeURIComponent(returnTo)}`}
            className="text-sm font-medium text-[var(--color-primary)]"
          >
            Registrar acompanhamento
          </Link>
          <Link href={`/app/clients/${row.client_id}`} className="text-sm font-medium text-[var(--color-link)]">
            Abrir cliente
          </Link>
        </div>
      </td>
    </>
  );
}

export default function AccompanimentPage() {
  const { me } = useAuth();
  const timeZone = me?.organization.timezone || "America/Sao_Paulo";
  const [pending, setPending] = useState<PendingRow[]>([]);
  const [recent, setRecent] = useState<RecentEvaluation[]>([]);
  const [daysThreshold, setDaysThreshold] = useState(15);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"pending" | "history">("pending");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const [pendingRes, recentRes] = await Promise.all([
        apiFetch<{ items: PendingRow[] }>(`/api/v1/accompaniment/pending?days_threshold=${daysThreshold}`),
        apiFetch<RecentEvaluation[]>("/api/v1/evaluations/recent?limit=30"),
      ]);
      if (cancelled) return;
      setLoading(false);
      if (pendingRes.error) {
        setError(pendingRes.error.message);
        return;
      }
      setPending(pendingRes.data?.items ?? []);
      setRecent(recentRes.data ?? []);
      setError(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [daysThreshold]);

  return (
    <div className="animate-fade-up">
      <BackLink href="/app" label="Início" />

      {/* Desktop: Pendentes vs Histórico, dense lists. */}
      <div className="hidden space-y-4 lg:block">
        <div>
          <h1 className="h-display text-3xl text-[var(--color-ink)]">Acompanhamentos</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            Registros de evolução do cliente — distinto da Agenda e das Rotinas.
          </p>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "pending"}
            onClick={() => setTab("pending")}
            className={`min-h-9 rounded-full px-3 text-sm font-semibold ${
              tab === "pending"
                ? "bg-[var(--color-primary)] text-[var(--color-on-primary)]"
                : "border border-[var(--color-border)] text-[var(--color-ink-muted)]"
            }`}
          >
            <IconClipboardList className="mr-1.5 inline h-4 w-4" aria-hidden />
            Pendentes {pending.length > 0 ? `· ${pending.length}` : ""}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "history"}
            onClick={() => setTab("history")}
            className={`min-h-9 rounded-full px-3 text-sm font-semibold ${
              tab === "history"
                ? "bg-[var(--color-primary)] text-[var(--color-on-primary)]"
                : "border border-[var(--color-border)] text-[var(--color-ink-muted)]"
            }`}
          >
            <IconHistory className="mr-1.5 inline h-4 w-4" aria-hidden />
            Histórico
          </button>
          {tab === "pending" ? (
            <label className="ml-auto flex items-center gap-2 text-sm text-[var(--color-ink-muted)]">
              Sem acompanhamento há mais de
              <select
                aria-label="Período sem acompanhamento"
                value={daysThreshold}
                onChange={(e) => setDaysThreshold(Number(e.target.value))}
                className="min-h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2"
              >
                {[7, 15, 30, 60].map((n) => (
                  <option key={n} value={n}>
                    {n} dias
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        {loading ? <p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p> : null}

        {!loading && tab === "pending" ? (
          pending.length === 0 ? (
            <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] px-4 py-8 text-center">
              <p className="font-medium">Ninguém pendente.</p>
              <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                Todos os clientes com ciclo ativo têm um acompanhamento recente.
              </p>
            </div>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
                  <th className="py-2 pr-3">Cliente</th>
                  <th className="py-2 pr-3">Serviço/ciclo</th>
                  <th className="py-2 pr-3">Último acompanhamento</th>
                  <th className="py-2 pr-3">Período sem acompanhamento</th>
                  <th className="py-2 pr-3">Próximo compromisso</th>
                  <th className="py-2 pr-3">Ação</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((row) => (
                  <tr
                    key={row.client_id}
                    className="border-b border-[var(--color-border)]/60 hover:bg-[var(--color-surface-subtle)]"
                  >
                    <PendingRowView row={row} timeZone={timeZone} />
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : null}

        {!loading && tab === "history" ? (
          recent.length === 0 ? (
            <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] px-4 py-8 text-center">
              <p className="font-medium">Nenhuma evolução publicada ainda.</p>
            </div>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
                  <th className="py-2 pr-3">Título</th>
                  <th className="py-2 pr-3">Publicado em</th>
                  <th className="py-2 pr-3">Ação</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((ev) => (
                  <tr
                    key={ev.id}
                    className="border-b border-[var(--color-border)]/60 hover:bg-[var(--color-surface-subtle)]"
                  >
                    <td className="py-2.5 pr-3 font-medium text-[var(--color-ink)]">{ev.title}</td>
                    <td className="py-2.5 pr-3 text-[var(--color-ink-muted)]">
                      {ev.published_at ? formatDatePt(ev.published_at, timeZone) : "—"}
                    </td>
                    <td className="py-2.5 pr-3">
                      <Link
                        href={`/app/clients/${ev.client_id}/evaluations/${ev.id}`}
                        className="text-sm font-medium text-[var(--color-link)]"
                      >
                        Abrir registro
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : null}
      </div>

      {/* Mobile: resumo — nunca a tabela densa do desktop. */}
      <div className="space-y-3 pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:hidden">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Acompanhamentos</h1>
          <p className="text-sm text-[var(--color-ink-muted)]">
            Clientes que precisam de um registro de evolução.
          </p>
        </header>
        {error ? (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {error}
          </p>
        ) : null}
        {loading ? <p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p> : null}

        {!loading && pending.length === 0 ? (
          <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] px-3 py-4">
            <p className="font-medium">Ninguém pendente.</p>
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
              Todos os clientes com ciclo ativo têm um acompanhamento recente.
            </p>
          </div>
        ) : null}

        <ul className="space-y-2.5">
          {pending.slice(0, 8).map((row) => (
            <li
              key={row.client_id}
              className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-[var(--color-ink)]">{row.client_name}</p>
                  <p className="text-sm text-[var(--color-ink-muted)]">{row.service_name || "Sem ciclo"}</p>
                </div>
                {row.days_since_last_evaluation == null ? (
                  <Badge tone="danger">Nunca</Badge>
                ) : (
                  <Badge tone={row.days_since_last_evaluation >= 30 ? "danger" : "warning"}>
                    {row.days_since_last_evaluation}d
                  </Badge>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-3">
                <Link
                  href={`/app/clients/${row.client_id}/evaluations/new?returnTo=${encodeURIComponent("/app/accompaniment")}`}
                  className="text-sm font-medium text-[var(--color-primary)]"
                >
                  Registrar acompanhamento
                </Link>
                <Link href={`/app/clients/${row.client_id}`} className="text-sm font-medium text-[var(--color-link)]">
                  <IconUser className="mr-1 inline h-3.5 w-3.5" aria-hidden />
                  Abrir cliente
                </Link>
              </div>
            </li>
          ))}
        </ul>

        {pending.length > 8 ? (
          <p className="text-center text-xs text-[var(--color-ink-subtle)]">
            +{pending.length - 8} cliente(s) — veja a lista completa no desktop.
          </p>
        ) : null}

        <Button fullWidth variant="secondary" onClick={() => setTab(tab === "history" ? "pending" : "history")}>
          {tab === "history" ? "Ver pendentes" : "Ver histórico recente"}
        </Button>
        {tab === "history" ? (
          <ul className="space-y-2">
            {recent.slice(0, 8).map((ev) => (
              <li
                key={ev.id}
                className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-3"
              >
                <p className="font-medium text-[var(--color-ink)]">{ev.title}</p>
                <p className="text-sm text-[var(--color-ink-muted)]">
                  {ev.published_at ? formatDatePt(ev.published_at, timeZone) : "—"}
                </p>
                <Link
                  href={`/app/clients/${ev.client_id}/evaluations/${ev.id}`}
                  className="text-sm font-medium text-[var(--color-link)]"
                >
                  Abrir registro
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
