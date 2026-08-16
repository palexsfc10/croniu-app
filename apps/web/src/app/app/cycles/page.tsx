"use client";

import { BackLink } from "@/components/app/back-link";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, formatBRL, type Cycle } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { IconChevronLeft, IconChevronRight } from "@/components/ui/icons";
import { cycleStatusTone } from "@/lib/status-tone";
import {
  cycleBucket,
  cycleListStatus,
  filterCycles,
  periodBounds,
  type CycleBucket,
  type PeriodPreset,
} from "@/lib/cycle-period";
import {
  formatCycleVigencyCard,
  monthTitle,
  shiftMonth,
  startOfMonth,
} from "@/lib/date-format";

export default function CyclesPage() {
  const router = useRouter();
  const [items, setItems] = useState<Cycle[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [today, setToday] = useState(() => new Date().toISOString().slice(0, 10));
  const [bucket, setBucket] = useState<CycleBucket>("renewing");
  const [preset, setPreset] = useState<PeriodPreset>("all");
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(today));
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [serviceFilter, setServiceFilter] = useState("");

  async function load() {
    const result = await apiFetch<Cycle[]>("/api/v1/cycles");
    if (result.error) setError(result.error.message);
    else {
      setError(null);
      setItems(result.data ?? []);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [cycles, pref] = await Promise.all([
        apiFetch<Cycle[]>("/api/v1/cycles"),
        apiFetch<{ local_today: string }>("/api/v1/organization/preferences"),
      ]);
      if (cancelled) return;
      if (pref.data?.local_today) {
        setToday(pref.data.local_today);
        setMonthCursor(startOfMonth(pref.data.local_today));
      }
      if (cycles.error) setError(cycles.error.message);
      else setItems(cycles.data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const period = periodBounds(preset, today, monthCursor, customStart, customEnd);
  const visible = useMemo(() => {
    let list = filterCycles(items, { bucket, today, period });
    if (serviceFilter) {
      list = list.filter((c) => (c.service_name || "").toLowerCase().includes(serviceFilter.toLowerCase()));
    }
    return list;
  }, [items, bucket, today, period, serviceFilter]);

  const counts = useMemo(() => {
    const inPeriod = period ? items.filter((c) => filterCycles([c], { bucket: "all", today, period }).length) : items;
    return {
      renewing: inPeriod.filter((c) => c.is_nearing_end && cycleBucket(c, today) === "active").length,
      active: inPeriod.filter((c) => cycleBucket(c, today) === "active").length,
      upcoming: inPeriod.filter((c) => cycleBucket(c, today) === "upcoming").length,
      ended: inPeriod.filter((c) => cycleBucket(c, today) === "ended").length,
      all: inPeriod.length,
    };
  }, [items, today, period]);

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
    bucket === "renewing"
      ? "Nenhuma renovação próxima neste filtro"
      : bucket === "active"
      ? "Nenhum ciclo em andamento"
      : period
        ? "Nenhum ciclo encontrado neste período."
        : "Nenhum ciclo";

  return (
    <div className="space-y-4 animate-fade-up">
      <BackLink href="/app" label="Hoje" />
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">
            Renovações
          </h1>
          <p className="text-sm text-[var(--color-ink-muted)]">
            Ciclos e decisões de renovação da organização.
          </p>
        </div>
        <Link href="/app/cycles/new" className="shrink-0">
          <Button className="whitespace-nowrap">Novo ciclo</Button>
        </Link>
      </div>

      <p className="text-sm text-[var(--color-ink-muted)]" role="status">
        Filtro ativo:{" "}
        {bucket === "renewing"
          ? "Próximas renovações"
          : bucket === "active"
            ? "Em andamento"
            : bucket === "upcoming"
              ? "Próximos"
              : bucket === "ended"
                ? "Encerrados"
                : "Todos"}{" "}
        · {visible.length} resultado{visible.length === 1 ? "" : "s"}
      </p>
      <div className="grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-5">
        <div className="rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] px-2 py-2">
          <p className="font-semibold text-[var(--color-ink)]">{counts.renewing}</p>
          <p className="text-[var(--color-ink-muted)]">Vencendo</p>
        </div>
        <div className="rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] px-2 py-2">
          <p className="font-semibold text-[var(--color-ink)]">{counts.active}</p>
          <p className="text-[var(--color-ink-muted)]">Ativos</p>
        </div>
        <div className="rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] px-2 py-2">
          <p className="font-semibold text-[var(--color-ink)]">{counts.upcoming}</p>
          <p className="text-[var(--color-ink-muted)]">Próximos</p>
        </div>
        <div className="rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] px-2 py-2">
          <p className="font-semibold text-[var(--color-ink)]">{counts.ended}</p>
          <p className="text-[var(--color-ink-muted)]">Encerrados</p>
        </div>
        <div className="rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] px-2 py-2">
          <p className="font-semibold text-[var(--color-ink)]">{counts.all}</p>
          <p className="text-[var(--color-ink-muted)]">Todos</p>
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Situação"
        className="grid grid-cols-2 gap-0.5 rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] p-0.5 sm:grid-cols-5"
      >
        {(
          [
            ["renewing", "Próximas"],
            ["active", "Em andamento"],
            ["upcoming", "Próximos"],
            ["ended", "Encerrados"],
            ["all", "Todos"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={bucket === id}
            className="min-h-11 rounded-[10px] px-2 text-sm font-medium text-[var(--color-ink-muted)] aria-selected:bg-[var(--color-surface)] aria-selected:text-[var(--color-ink)] aria-selected:shadow-[0_1px_2px_rgba(15,15,20,0.06)]"
            onClick={() => setBucket(id)}
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
        <p className="text-sm font-medium">{monthTitle(preset === "month" ? monthCursor : startOfMonth(today))}</p>
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
              className="block min-h-11 w-full rounded-[var(--radius-md)] px-2 text-left text-sm aria-selected:bg-[var(--color-surface-subtle)]"
              aria-selected={preset === id}
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
              className="mt-1 block w-full min-h-11 rounded-[var(--radius-md)] border border-[var(--color-border)] px-2"
              value={serviceFilter}
              onChange={(e) => setServiceFilter(e.target.value)}
            />
          </label>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}

      {!visible.length ? (
        <EmptyState
          title={emptyTitle}
          description={
            bucket === "active"
              ? "Os ciclos ativos aparecerão aqui."
              : bucket === "upcoming"
                ? "Ciclos que ainda não começaram aparecem em Próximos."
                : "Altere o período ou a situação."
          }
        />
      ) : null}

      <ul className="space-y-2">
        {visible.map((item) => (
          <li
            key={item.id}
            className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3"
          >
            <button type="button" className="w-full text-left" onClick={() => router.push(`/app/cycles/${item.id}`)}>
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-[var(--color-ink)]">{item.client_name}</p>
                <Badge tone={cycleStatusTone(item.status, item.is_nearing_end)}>
                  {cycleListStatus(item, today)}
                </Badge>
              </div>
              <p className="text-sm text-[var(--color-ink)]">{item.service_name}</p>
              <p className="text-sm text-[var(--color-ink-muted)]">
                {formatCycleVigencyCard(item.starts_on, item.ends_on).range}
              </p>
              <p className="text-xs text-[var(--color-ink-muted)]">
                {formatCycleVigencyCard(item.starts_on, item.ends_on).renewal}
              </p>
              <p className="mt-1 text-sm text-[var(--color-ink)]">
                {item.lesson_count != null
                  ? `${item.lessons_completed ?? 0} de ${item.lesson_count} aulas`
                  : ""}
                {item.days_remaining != null && item.status === "active"
                  ? ` · Termina em ${item.days_remaining} dias`
                  : ""}
                {` · ${formatBRL(item.value_cents)}`}
              </p>
            </button>
            <Link href={`/app/cycles/${item.id}`} className="mt-2 inline-block">
              <Button variant="secondary">Ver ciclo</Button>
            </Link>
            {item.status !== "cancelled" ? (
              <details className="mt-2">
                <summary className="cursor-pointer text-sm text-[var(--color-ink-muted)]">Mais</summary>
                <div className="mt-2 flex gap-2">
                  <Link href={`/app/cycles/${item.id}/edit`}>
                    <Button variant="ghost">Editar</Button>
                  </Link>
                  <Button
                    variant="danger"
                    disabled={busyId === item.id}
                    onClick={() => void removeCycle(item.id)}
                  >
                    {busyId === item.id ? "…" : "Excluir"}
                  </Button>
                </div>
              </details>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
