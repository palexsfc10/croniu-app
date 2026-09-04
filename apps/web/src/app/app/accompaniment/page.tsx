"use client";

/**
 * Acompanhamentos. IMPORTANT domain note (gate correction, 2026-09-02):
 * Croniu distinguishes Acompanhamento (registro contínuo de evolução/
 * contato/percepção) from Avaliação (medição estruturada e periódica).
 * There is today **no dedicated accompaniment log/table** anywhere in the
 * backend — `Client.notes` is a single overwritten field (no history),
 * `Cycle.last_contacted_at`/`contact_confirmed_at` are renewal-specific,
 * and `ClientJourney` has no repeated log. The only real, dated,
 * per-client registration mechanism that exists is `ClientEvaluation`
 * (avaliação — see `backend/app/services/client_evolution.py`). So this
 * page's "Pendentes" tab is honestly labeled **avaliação pendente**, not
 * "acompanhamento pendente" — it never claims a continuous-accompaniment
 * pendency the product doesn't actually track yet. "Histórico" shows only
 * published avaliações — never mixed with any other registro type.
 * Distinct from Rotinas (`/app/routines`, task reminders) and from the
 * client-onboarding "Preparar acompanhamento" checklist nested under
 * `/app/clients/[clientId]/accompaniment` (a different, pre-existing
 * concept).
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconClipboardList, IconHistory, IconUser } from "@/components/ui/icons";
import { BackLink } from "@/components/app/back-link";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { TableShell, Th, Tr, Td } from "@/components/ui/table-shell";
import { BlockError } from "@/components/ui/block-error";

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
      <Td className="font-medium text-[var(--color-ink)]">
        <Link href={`/app/clients/${row.client_id}`} className="hover:underline">
          {row.client_name}
        </Link>
      </Td>
      <Td className="text-[var(--color-ink-muted)]">{row.service_name || "—"}</Td>
      <Td className="text-[var(--color-ink-muted)]">
        {row.last_evaluation_at ? formatDatePt(row.last_evaluation_at, timeZone) : "Nunca"}
      </Td>
      <Td className="tabular-nums">
        {row.days_since_last_evaluation == null ? (
          <Badge tone="danger">Nunca avaliado</Badge>
        ) : (
          <Badge tone={row.days_since_last_evaluation >= 30 ? "danger" : "warning"}>
            {row.days_since_last_evaluation} dias
          </Badge>
        )}
      </Td>
      <Td className="text-[var(--color-ink-muted)]">
        {row.next_appointment_at ? formatDatePt(row.next_appointment_at, timeZone) : "—"}
      </Td>
      <Td>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/app/clients/${row.client_id}/evaluations/new?returnTo=${encodeURIComponent(returnTo)}`}
            className="text-sm font-medium text-[var(--color-primary)]"
          >
            Registrar avaliação
          </Link>
          <Link href={`/app/clients/${row.client_id}`} className="text-sm font-medium text-[var(--color-link)]">
            Abrir cliente
          </Link>
        </div>
      </Td>
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
            Avaliações registradas por cliente — distinto da Agenda e das Rotinas. Sem um registro
            dedicado de acompanhamento contínuo ainda, o sinal usa a avaliação mais recente.
          </p>
        </div>

        {error ? <BlockError message={error} /> : null}

        <div className="flex flex-wrap items-center gap-2" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "pending"}
            onClick={() => setTab("pending")}
            className={`min-h-9 rounded-full px-3 text-sm font-semibold ${
              tab === "pending"
                ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                : "border border-[var(--color-border)] text-[var(--color-ink-muted)]"
            }`}
          >
            <IconClipboardList className="mr-1.5 inline h-4 w-4" aria-hidden />
            Avaliações pendentes {pending.length > 0 ? `· ${pending.length}` : ""}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "history"}
            onClick={() => setTab("history")}
            className={`min-h-9 rounded-full px-3 text-sm font-semibold ${
              tab === "history"
                ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                : "border border-[var(--color-border)] text-[var(--color-ink-muted)]"
            }`}
          >
            <IconHistory className="mr-1.5 inline h-4 w-4" aria-hidden />
            Histórico
          </button>
          {tab === "pending" ? (
            <label className="ml-auto flex items-center gap-2 text-sm text-[var(--color-ink-muted)]">
              Sem avaliação há mais de
              <select
                aria-label="Período sem avaliação"
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

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : null}

        {!loading && tab === "pending" ? (
          pending.length === 0 ? (
            <EmptyState
              title="Nenhuma avaliação pendente."
              description="Todos os clientes com ciclo ativo têm uma avaliação recente."
            />
          ) : (
            <TableShell>
            <table className="w-full text-sm">
              <thead>
                <Tr>
                  <Th>Cliente</Th>
                  <Th>Serviço/ciclo</Th>
                  <Th>Última avaliação</Th>
                  <Th>Dias sem avaliação</Th>
                  <Th>Próximo compromisso</Th>
                  <Th>Ação</Th>
                </Tr>
              </thead>
              <tbody>
                {pending.map((row) => (
                  <Tr key={row.client_id} className="hover:bg-[var(--color-surface-subtle)]">
                    <PendingRowView row={row} timeZone={timeZone} />
                  </Tr>
                ))}
              </tbody>
            </table>
            </TableShell>
          )
        ) : null}

        {!loading && tab === "history" ? (
          recent.length === 0 ? (
            <EmptyState title="Nenhuma avaliação publicada ainda" description="Publique uma avaliação para vê-la aqui." />
          ) : (
            <TableShell>
            <table className="w-full text-sm">
              <thead>
                <Tr>
                  <Th>Título</Th>
                  <Th>Publicado em</Th>
                  <Th>Ação</Th>
                </Tr>
              </thead>
              <tbody>
                {recent.map((ev) => (
                  <Tr key={ev.id} className="hover:bg-[var(--color-surface-subtle)]">
                    <Td className="font-medium text-[var(--color-ink)]">{ev.title}</Td>
                    <Td className="text-[var(--color-ink-muted)]">
                      {ev.published_at ? formatDatePt(ev.published_at, timeZone) : "—"}
                    </Td>
                    <Td>
                      <Link
                        href={`/app/clients/${ev.client_id}/evaluations/${ev.id}`}
                        className="text-sm font-medium text-[var(--color-link)]"
                      >
                        Abrir registro
                      </Link>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </table>
            </TableShell>
          )
        ) : null}
      </div>

      {/* Mobile: resumo — nunca a tabela densa do desktop. */}
      <div className="space-y-3 pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:hidden">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Acompanhamentos</h1>
          <p className="text-sm text-[var(--color-ink-muted)]">
            Clientes com avaliação pendente ou nunca avaliados.
          </p>
        </header>
        {error ? <BlockError message={error} /> : null}
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : null}

        {!loading && pending.length === 0 ? (
          <EmptyState
            title="Nenhuma avaliação pendente."
            description="Todos os clientes com ciclo ativo têm uma avaliação recente."
          />
        ) : null}

        <ul className="space-y-2.5">
          {pending.slice(0, 8).map((row) => (
            <li
              key={row.client_id}
              className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-3 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-[var(--color-ink)]">{row.client_name}</p>
                  <p className="text-sm text-[var(--color-ink-muted)]">{row.service_name || "Sem ciclo"}</p>
                </div>
                {row.days_since_last_evaluation == null ? (
                  <Badge tone="danger">Nunca avaliado</Badge>
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
                  Registrar avaliação
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
          {tab === "history" ? "Ver avaliações pendentes" : "Ver histórico recente"}
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
