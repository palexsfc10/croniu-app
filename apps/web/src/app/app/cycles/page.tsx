"use client";

import { BackLink } from "@/components/app/back-link";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  apiFetch,
  formatBRL,
  type Cycle,
  type NextAppointmentsByClient,
  type Receivable,
} from "@/lib/api";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { IconChevronLeft, IconChevronRight } from "@/components/ui/icons";
import {
  buildCycleRow,
  matchesCycleView,
  renewalTarget,
  CYCLE_ALERT_LABEL,
  type CycleRow,
  type CycleView,
} from "@/lib/cycle-central";
import { cycleInPeriod, periodBounds, type PeriodPreset } from "@/lib/cycle-period";
import {
  formatCycleVigencyCard,
  formatHumanDate,
  formatLessonClock,
  monthTitle,
  shiftMonth,
  startOfMonth,
} from "@/lib/date-format";

const RETURN_TO = "/app/cycles";

const VIEWS: { id: CycleView; label: string }[] = [
  { id: "attention", label: "Exige atenção" },
  { id: "renewing", label: "Renovação próxima" },
  { id: "active", label: "Em andamento" },
  { id: "upcoming", label: "Próximos" },
  { id: "ended", label: "Encerrados" },
  { id: "all", label: "Todos" },
];

type RenewalRequestLite = { id: string; source_cycle_id: string; status: string };

function nextSessionLabel(row: CycleRow, tz: string): string {
  const appt = row.nextAppointment;
  if (!appt) return "—";
  const clock = formatLessonClock(appt.starts_at, tz);
  return `${formatHumanDate(appt.starts_at.slice(0, 10))}${clock ? `, ${clock}` : ""}`;
}

function financeLabel(row: CycleRow): string {
  if (row.overdueCount > 0) return `${formatBRL(row.pendingCents)} · atrasado`;
  if (row.pendingCents > 0) return `${formatBRL(row.pendingCents)} em aberto`;
  return "Em dia";
}

export default function CyclesPage() {
  const { me } = useAuth();
  const tz = me?.organization.timezone || "America/Sao_Paulo";

  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [nextAppointments, setNextAppointments] = useState<NextAppointmentsByClient>({});
  const [openRenewalCycleIds, setOpenRenewalCycleIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [today, setToday] = useState(() => new Date().toISOString().slice(0, 10));
  const [view, setView] = useState<CycleView>("attention");
  const [preset, setPreset] = useState<PeriodPreset>("all");
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(today));
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [serviceFilter, setServiceFilter] = useState("");

  async function load() {
    const [cyc, rec, appts, renewals, pref] = await Promise.all([
      apiFetch<Cycle[]>("/api/v1/cycles"),
      apiFetch<Receivable[]>("/api/v1/receivables"),
      apiFetch<NextAppointmentsByClient>("/api/v1/agenda/next-appointments"),
      apiFetch<RenewalRequestLite[]>("/api/v1/renewal-requests"),
      apiFetch<{ local_today: string }>("/api/v1/organization/preferences"),
    ]);
    if (pref.data?.local_today) {
      setToday(pref.data.local_today);
      setMonthCursor(startOfMonth(pref.data.local_today));
    }
    if (cyc.error) setError(cyc.error.message);
    else {
      setError(null);
      setCycles(cyc.data ?? []);
    }
    setReceivables(rec.data ?? []);
    setNextAppointments(appts.data ?? {});
    setOpenRenewalCycleIds(
      new Set(
        (renewals.data ?? [])
          .filter((r) => r.status === "requested" || r.status === "acknowledged" || r.status === "payment_reported")
          .map((r) => r.source_cycle_id),
      ),
    );
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await load();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(
    () =>
      cycles.map((c) =>
        buildCycleRow(c, {
          allCycles: cycles,
          receivables,
          nextAppointmentByClientId: nextAppointments,
          openRenewalCycleIds,
          today,
        }),
      ),
    [cycles, receivables, nextAppointments, openRenewalCycleIds, today],
  );

  const period = periodBounds(preset, today, monthCursor, customStart, customEnd);

  const visible = useMemo(() => {
    return rows.filter((row) => {
      if (!matchesCycleView(row, view, today)) return false;
      if (period && !cycleInPeriod(row.cycle, period.start, period.end)) return false;
      if (
        serviceFilter &&
        !(row.cycle.service_name || "").toLowerCase().includes(serviceFilter.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [rows, view, today, period, serviceFilter]);

  const counts = useMemo(() => {
    const inPeriod = period
      ? rows.filter((r) => cycleInPeriod(r.cycle, period.start, period.end))
      : rows;
    const by = (v: CycleView) => inPeriod.filter((r) => matchesCycleView(r, v, today)).length;
    return {
      attention: by("attention"),
      renewing: by("renewing"),
      active: by("active"),
      ended: by("ended"),
    };
  }, [rows, today, period]);

  async function removeCycle(id: string) {
    const ok = window.confirm(
      "Excluir este ciclo? Ele será cancelado; aulas agendadas e recebimentos em aberto também.",
    );
    if (!ok) return;
    setBusyId(id);
    setError(null);
    const result = await apiFetch<Cycle>(`/api/v1/cycles/${id}/cancel`, { method: "POST" });
    setBusyId(null);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    await load();
  }

  const emptyTitle =
    view === "attention"
      ? "Nenhum ciclo exigindo atenção"
      : view === "renewing"
        ? "Nenhuma renovação próxima neste filtro"
        : view === "active"
          ? "Nenhum ciclo em andamento"
          : "Nenhum ciclo neste filtro";

  return (
    <div className="space-y-5 animate-fade-up">
      <BackLink href="/app" label="Início" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="h-display text-3xl text-[var(--color-ink)]">Ciclos</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            Contratos de clientes em execução. Para o que você oferece, veja{" "}
            <Link href="/app/services" className="font-medium text-[var(--color-link)] hover:underline">
              Serviços
            </Link>{" "}
            e{" "}
            <Link
              href="/app/cycle-templates"
              className="font-medium text-[var(--color-link)] hover:underline"
            >
              Modelos de ciclo
            </Link>
            .
          </p>
        </div>
        <Link href={`/app/cycles/new?returnTo=${encodeURIComponent(RETURN_TO)}`} className="shrink-0">
          <Button className="whitespace-nowrap">Novo ciclo</Button>
        </Link>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
        {(
          [
            ["Exige atenção", counts.attention],
            ["Renovação próxima", counts.renewing],
            ["Em andamento", counts.active],
            ["Encerrados", counts.ended],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] px-2 py-2">
            <p className="font-semibold text-[var(--color-ink)]">{value}</p>
            <p className="text-[var(--color-ink-muted)]">{label}</p>
          </div>
        ))}
      </div>

      <div
        role="tablist"
        aria-label="Situação do ciclo"
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
            {label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className="min-h-11 min-w-11"
          aria-label="Mês anterior"
          onClick={() => {
            setPreset("month");
            setMonthCursor((m) => shiftMonth(m, -1));
          }}
        >
          <IconChevronLeft className="h-5 w-5" />
        </button>
        <p className="text-sm font-medium">
          {monthTitle(preset === "month" ? monthCursor : startOfMonth(today))}
        </p>
        <button
          type="button"
          className="min-h-11 min-w-11"
          aria-label="Mês seguinte"
          onClick={() => {
            setPreset("month");
            setMonthCursor((m) => shiftMonth(m, 1));
          }}
        >
          <IconChevronRight className="h-5 w-5" />
        </button>
      </div>
      <button
        type="button"
        className="text-sm font-medium text-[var(--color-primary)]"
        onClick={() => setFiltersOpen((v) => !v)}
      >
        Alterar período
      </button>

      {filtersOpen ? (
        <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          {(
            [
              ["all", "Todos"],
              ["this_month", "Este mês"],
              ["next_30", "Próximos 30 dias"],
              ["last_30", "Últimos 30 dias"],
              ["month", "Escolher mês"],
              ["custom", "Intervalo personalizado"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className="block min-h-11 w-full rounded-[var(--radius-md)] px-2 text-left text-sm aria-pressed:bg-[var(--color-surface-subtle)] aria-pressed:font-medium"
              aria-pressed={preset === id}
              onClick={() => {
                setPreset(id);
                if (id !== "custom") setFiltersOpen(false);
              }}
            >
              {label}
            </button>
          ))}
          {preset === "custom" ? (
            <div className="flex flex-wrap items-end gap-2 pt-2">
              <label className="text-sm">
                Início
                <input
                  type="date"
                  className="mt-1 block min-h-11 rounded-[var(--radius-md)] border border-[var(--color-border)] px-2"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                />
              </label>
              <label className="text-sm">
                Fim
                <input
                  type="date"
                  className="mt-1 block min-h-11 rounded-[var(--radius-md)] border border-[var(--color-border)] px-2"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                />
              </label>
            </div>
          ) : null}
          <label className="block pt-2 text-sm">
            Serviço
            <input
              className="mt-1 block min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] px-2"
              value={serviceFilter}
              onChange={(e) => setServiceFilter(e.target.value)}
            />
          </label>
        </div>
      ) : null}

      {loading ? <p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p> : null}

      {!loading && !visible.length ? (
        <EmptyState
          title={emptyTitle}
          description={
            view === "attention"
              ? "Nenhuma renovação vencendo, cobrança atrasada ou ciclo sem agenda agora."
              : "Altere a situação ou o período para ver outros ciclos."
          }
          action={
            <Link href={`/app/cycles/new?returnTo=${encodeURIComponent(RETURN_TO)}`}>
              <Button>Novo ciclo</Button>
            </Link>
          }
        />
      ) : null}

      {/* Desktop: tabela densa com todas as colunas reais */}
      {visible.length ? (
        <div className="hidden overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)]/80 bg-[var(--color-surface)] lg:block">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]/60 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
                  <th className="px-3.5 py-2.5">Cliente</th>
                  <th className="px-3.5 py-2.5">Serviço</th>
                  <th className="px-3.5 py-2.5">Período</th>
                  <th className="px-3.5 py-2.5">Situação</th>
                  <th className="px-3.5 py-2.5">Progresso</th>
                  <th className="px-3.5 py-2.5">Próxima sessão</th>
                  <th className="px-3.5 py-2.5">Financeiro</th>
                  <th className="px-3.5 py-2.5">Ações</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const c = row.cycle;
                  const vigency = formatCycleVigencyCard(c.starts_on, c.ends_on);
                  const renewHref = renewalTarget(row, RETURN_TO);
                  return (
                    <tr key={c.id} className="border-b border-[var(--color-border)]/50 last:border-b-0">
                      <td className="px-3.5 py-3">
                        <Link
                          href={`/app/clients/${c.client_id}?tab=plano`}
                          className="font-medium text-[var(--color-ink)] hover:underline"
                        >
                          {c.client_name}
                        </Link>
                        {row.alerts.length ? (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {row.alerts.map((a) => (
                              <Badge key={a} tone={a === "financial" ? "danger" : "warning"}>
                                {CYCLE_ALERT_LABEL[a]}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3.5 py-3 text-[var(--color-ink-muted)]">{c.service_name}</td>
                      <td className="px-3.5 py-3 text-[var(--color-ink-muted)] tabular-nums">
                        <span className="block">{vigency.range}</span>
                        <span className="block text-xs">{vigency.renewal}</span>
                      </td>
                      <td className="px-3.5 py-3">
                        <Badge tone={row.statusTone}>{row.statusLabel}</Badge>
                      </td>
                      <td className="px-3.5 py-3 text-[var(--color-ink-muted)] tabular-nums">
                        {row.progress ? `${row.progress.done} de ${row.progress.total}` : "—"}
                      </td>
                      <td className="px-3.5 py-3 text-[var(--color-ink-muted)] tabular-nums">
                        {nextSessionLabel(row, tz)}
                      </td>
                      <td
                        className={`px-3.5 py-3 tabular-nums ${
                          row.overdueCount > 0
                            ? "font-medium text-[var(--color-danger)]"
                            : "text-[var(--color-ink-muted)]"
                        }`}
                      >
                        {financeLabel(row)}
                      </td>
                      <td className="px-3.5 py-3">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          {renewHref ? (
                            <Link
                              href={renewHref}
                              className="font-medium text-[var(--color-primary)] hover:underline"
                            >
                              Preparar renovação
                            </Link>
                          ) : null}
                          <Link href={`/app/cycles/${c.id}`} className="text-[var(--color-link)] hover:underline">
                            Ver ciclo
                          </Link>
                          {c.status !== "cancelled" ? (
                            <button
                              type="button"
                              disabled={busyId === c.id}
                              onClick={() => void removeCycle(c.id)}
                              className="text-[var(--color-ink-muted)] hover:text-[var(--color-danger)] hover:underline disabled:opacity-55"
                            >
                              {busyId === c.id ? "…" : "Excluir"}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* Mobile: resumo do que exige decisão, nunca a tabela comprimida */}
      {visible.length ? (
        <ul className="space-y-2 lg:hidden">
          {visible.map((row) => {
            const c = row.cycle;
            const renewHref = renewalTarget(row, RETURN_TO);
            const headline = row.alerts.length ? CYCLE_ALERT_LABEL[row.alerts[0]] : null;
            return (
              <li
                key={c.id}
                className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[var(--color-ink)]">{c.client_name}</p>
                    <p className="truncate text-sm text-[var(--color-ink-muted)]">{c.service_name}</p>
                  </div>
                  <Badge tone={row.statusTone}>{row.statusLabel}</Badge>
                </div>

                <p className="mt-1.5 text-sm text-[var(--color-ink-muted)]">
                  {row.nextAppointment
                    ? `Próxima sessão: ${nextSessionLabel(row, tz)}`
                    : formatCycleVigencyCard(c.starts_on, c.ends_on).renewal}
                </p>
                {headline ? (
                  <p
                    className={`mt-0.5 text-sm font-medium ${
                      row.alerts.includes("financial")
                        ? "text-[var(--color-danger)]"
                        : "text-[var(--color-ink)]"
                    }`}
                  >
                    {row.alerts.includes("financial") ? financeLabel(row) : headline}
                  </p>
                ) : null}

                <div className="mt-2 flex flex-wrap gap-3">
                  {renewHref ? (
                    <Link href={renewHref} className="text-sm font-medium text-[var(--color-primary)]">
                      Preparar renovação
                    </Link>
                  ) : null}
                  <Link href={`/app/cycles/${c.id}`} className="text-sm font-medium text-[var(--color-link)]">
                    Ver ciclo
                  </Link>
                  <Link
                    href={`/app/clients/${c.client_id}?tab=plano`}
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
        Perguntar ao Assistente sobre estes ciclos
      </Link>
    </div>
  );
}
