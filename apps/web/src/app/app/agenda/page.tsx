"use client";

import { BackLink } from "@/components/app/back-link";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  apiFetch,
  appointmentStatusLabel,
  formatOrgDateTime,
  type AgendaRange,
  type Appointment,
  type AvailabilityDay,
  type AvailabilitySettings,
  type DayAgenda,
  type OrgPreferences,
} from "@/lib/api";
import { formatHumanDate, formatHumanDateRange, formatNextLessonLine } from "@/lib/date-format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockError } from "@/components/ui/block-error";
import { PageTitle } from "@/components/ui/page-title";
import { appointmentStatusTone } from "@/lib/status-tone";
import {
  addDaysToIsoDate,
  computeGridBounds,
  isoWeekdayMonday0,
  startOfWeekMonday,
} from "@/lib/calendar-grid";
import { CalendarGrid, CalendarLegend, type CalendarGridDay } from "@/components/app/calendar-grid";
import {
  IconCalendarPlus,
  IconChevronLeft,
  IconChevronRight,
  IconSliders,
} from "@/components/ui/icons";
import { AskAssistantLink } from "@/components/ui/ask-assistant-link";

type View = "day" | "week";

function EmptyAgenda({
  day,
  timezone,
}: {
  day: string | null;
  timezone: string;
}) {
  const [nextDay, setNextDay] = useState<string | null>(null);
  const [nextLine, setNextLine] = useState<string | null>(null);
  useEffect(() => {
    if (!day) return;
    void (async () => {
      const result = await apiFetch<{
        date: string | null;
        timezone: string;
        appointment: { client_name: string | null; starts_at: string } | null;
      }>(`/api/v1/agenda/next?after=${day}`);
      setNextDay(result.data?.date ?? null);
      if (result.data?.appointment && result.data.date) {
        setNextLine(
          formatNextLessonLine(
            result.data.appointment.client_name,
            result.data.appointment.starts_at,
            result.data.timezone || timezone,
          ),
        );
      } else {
        setNextLine(null);
      }
    })();
  }, [day, timezone]);
  const dayLabel = day ? formatHumanDate(day) : "este dia";
  // One contextual action, not three equivalent ones — the page around
  // this empty state already has its own primary "Novo compromisso"/
  // "Agendar" action (header on desktop, full-width button on mobile), so
  // this only ever adds a *different* action: jumping to the next real
  // appointment, when there is one.
  return (
    <EmptyState
      title={`Nenhum compromisso em ${dayLabel}`}
      description={nextLine ?? "Não há aula nesta data."}
      action={
        nextDay ? (
          <Link
            href={`/app/agenda?day=${nextDay}`}
            className="btn-primary inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius-md)] px-4 text-sm font-semibold"
          >
            Ver próxima aula
          </Link>
        ) : undefined
      }
    />
  );
}

function shiftDay(isoDay: string, delta: number) {
  const [y, m, d] = isoDay.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function shortDayMonth(isoDay: string): string {
  const [, m, d] = isoDay.split("-");
  return `${d}/${m}`;
}

const WEEKDAY_SHORT = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

type RoutineBoardItem = {
  id: string;
  client_id: string | null;
  client_name: string | null;
  status: string;
  status_label: string;
  due_on: string;
  operational_date: string;
  overdue: boolean;
  name: string | null;
  type_label: string;
};

type RoutineBoardResponse = {
  today: string;
  groups: Array<{ items?: RoutineBoardItem[] }>;
};

function flattenRoutineItems(
  groups: Array<{ items?: RoutineBoardItem[] }> | undefined,
): RoutineBoardItem[] {
  return (groups ?? []).flatMap((g) => g.items ?? []);
}

/** Rotinas são tarefas agendadas pelo profissional — precisam aparecer no
 * dia correspondente, não só como uma contagem genérica. Reusa exatamente
 * o fetch de dia único que a Agenda já fazia antes da reconstrução
 * (`on=<dia>`) para itens abertos/adiados. Esse endpoint nunca devolve
 * ocorrências concluídas quando `on` é passado (regra legada e proposital
 * do dia-view) — por isso uma segunda chamada, já usada do mesmo jeito
 * pelo hub de Rotinas (`include_completed=true`, sem `on`), supre as
 * concluídas do dia via filtro no cliente. Nenhuma regra de negócio nova:
 * o próprio `on=hoje` já mistura pendências atrasadas de outros dias na
 * resposta (`overdue: true`) — aqui elas são separadas para um aviso
 * compacto em vez de aparecerem como se fossem do dia selecionado. */
function useAgendaRoutines(day: string | null) {
  const [openItems, setOpenItems] = useState<RoutineBoardItem[]>([]);
  const [completedItems, setCompletedItems] = useState<RoutineBoardItem[]>([]);
  const [overdueCount, setOverdueCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load(forDay: string) {
    setLoading(true);
    const [dayResult, fullResult] = await Promise.all([
      apiFetch<RoutineBoardResponse>(`/api/v1/routines/board?on=${forDay}`),
      apiFetch<RoutineBoardResponse>("/api/v1/routines/board?include_completed=true"),
    ]);
    const dayItems = flattenRoutineItems(dayResult.data?.groups);
    setOpenItems(dayItems.filter((item) => !item.overdue));
    setOverdueCount(dayItems.filter((item) => item.overdue).length);
    const fullItems = flattenRoutineItems(fullResult.data?.groups);
    setCompletedItems(
      fullItems.filter((item) => item.status === "completed" && item.operational_date === forDay),
    );
    setLoading(false);
  }

  useEffect(() => {
    if (!day) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- remote hydrate
    void load(day);
  }, [day]);

  async function decide(id: string, status: "completed" | "deferred") {
    setBusyId(id);
    const body: { status: string; deferred_until?: string } = { status };
    if (status === "deferred" && day) {
      body.deferred_until = shiftDay(day, 1);
    }
    await apiFetch(`/api/v1/routines/occurrences/${id}/decide`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    setBusyId(null);
    if (day) await load(day);
  }

  return { openItems, completedItems, overdueCount, loading, busyId, decide };
}

function routineStatusTone(status: string): "neutral" | "warning" | "success" {
  if (status === "completed") return "success";
  if (status === "deferred") return "warning";
  return "neutral";
}

/** Compact row — compromisso e rotina nunca se misturam na mesma lista,
 * então esta linha nunca aparece na timeline de compromissos, só na seção
 * "Rotinas do dia". Concluída fica visualmente reduzida e sem ações. */
function RoutineRow({
  item,
  todayIso,
  busy,
  actions,
}: {
  item: RoutineBoardItem;
  todayIso: string | null;
  busy: boolean;
  actions: { onComplete: () => void; onDefer: () => void } | null;
}) {
  const dueLabel = item.due_on === todayIso ? "Hoje" : formatHumanDate(item.due_on);
  return (
    <li
      className={`rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-sm ${
        actions ? "bg-[var(--color-surface)]" : "opacity-60"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="truncate font-medium text-[var(--color-ink)]">
          {item.name || item.type_label}
        </p>
        <Badge tone={routineStatusTone(item.status)}>{item.status_label}</Badge>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <p className="truncate text-xs text-[var(--color-ink-muted)]">
          {item.client_name ? `${item.client_name} · ${dueLabel}` : dueLabel}
        </p>
        {actions ? (
          <div className="flex shrink-0 items-center gap-2.5">
            <button
              type="button"
              className="text-xs font-semibold text-[var(--color-link)] disabled:opacity-50"
              disabled={busy}
              onClick={actions.onComplete}
            >
              Concluir
            </button>
            <button
              type="button"
              className="text-xs font-medium text-[var(--color-ink-muted)] disabled:opacity-50"
              disabled={busy}
              onClick={actions.onDefer}
            >
              Adiar
            </button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

const MOBILE_ROUTINE_CAP = 3;

/** "Rotinas do dia" — sempre abaixo dos compromissos, nunca dentro da
 * mesma lista. Desktop mostra a lista compacta inteira; mobile corta nas
 * primeiras e empurra o resto para o hub via "Ver todas", nunca
 * reproduzindo o hub completo aqui. */
function AgendaRoutines({
  day,
  todayIso,
  variant,
}: {
  day: string | null;
  todayIso: string | null;
  variant: "desktop" | "mobile";
}) {
  const { openItems, completedItems, overdueCount, loading, busyId, decide } =
    useAgendaRoutines(day);

  if (!day) return null;
  if (loading && !openItems.length && !completedItems.length && !overdueCount) {
    return <Skeleton className="h-16 w-full" />;
  }
  if (!openItems.length && !completedItems.length && !overdueCount) return null;

  const visibleOpen = variant === "mobile" ? openItems.slice(0, MOBILE_ROUTINE_CAP) : openItems;
  const hasMore =
    variant === "mobile" &&
    (openItems.length > visibleOpen.length || completedItems.length > 0);

  return (
    <section aria-label="Rotinas do dia" className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--color-ink-muted)]">
          Rotinas do dia
        </h2>
        <Link href="/app/routines" className="text-xs font-semibold text-[var(--color-link)]">
          Ver rotinas
        </Link>
      </div>

      {overdueCount > 0 && day === todayIso ? (
        <Link
          href="/app/routines"
          className="block rounded-[var(--radius-md)] border border-[var(--color-danger)]/30 bg-[var(--color-danger-subtle)] px-3 py-2 text-xs font-semibold text-[var(--color-danger)]"
        >
          {overdueCount} rotina{overdueCount === 1 ? "" : "s"} atrasada
          {overdueCount === 1 ? "" : "s"}
        </Link>
      ) : null}

      {visibleOpen.length || (variant === "desktop" && completedItems.length) ? (
        <ul className="space-y-1.5">
          {visibleOpen.map((item) => (
            <RoutineRow
              key={item.id}
              item={item}
              todayIso={todayIso}
              busy={busyId === item.id}
              actions={{
                onComplete: () => void decide(item.id, "completed"),
                onDefer: () => void decide(item.id, "deferred"),
              }}
            />
          ))}
          {variant === "desktop"
            ? completedItems.map((item) => (
                <RoutineRow key={item.id} item={item} todayIso={todayIso} busy={false} actions={null} />
              ))
            : null}
        </ul>
      ) : null}

      {hasMore ? (
        <Link
          href="/app/routines"
          className="block rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-1.5 text-center text-xs font-semibold text-[var(--color-link)]"
        >
          Ver todas
        </Link>
      ) : null}
    </section>
  );
}

/** Simple, compact daily appointment card shared by the mobile timeline. */
function MobileAppointmentRow({ appt, timezone }: { appt: Appointment; timezone: string }) {
  return (
    <li className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold tabular-nums text-[var(--color-ink)]">
            {formatOrgDateTime(appt.starts_at, timezone)} – {formatOrgDateTime(appt.ends_at, timezone)}
          </p>
          <p className="truncate font-semibold text-[var(--color-ink)]">{appt.client_name}</p>
          <p className="truncate text-sm text-[var(--color-ink-muted)]">
            {appt.location_name || "Sem local"}
            {appt.service_name || appt.cycle_service_name
              ? ` · ${appt.service_name || appt.cycle_service_name}`
              : ""}
          </p>
        </div>
        <Badge tone={appointmentStatusTone(appt.status)}>{appointmentStatusLabel(appt.status)}</Badge>
      </div>
      <div className="mt-2 flex flex-wrap gap-3">
        <Link href={`/app/appointments/${appt.id}`} className="text-sm font-medium text-[var(--color-link)]">
          Abrir compromisso
        </Link>
        <Link href={`/app/clients/${appt.client_id}`} className="text-sm font-medium text-[var(--color-link)]">
          Abrir cliente
        </Link>
      </div>
    </li>
  );
}

export default function AgendaPage() {
  const router = useRouter();
  const search = useSearchParams();
  const dayParam = search.get("day");
  const view: View = search.get("view") === "week" ? "week" : "day";
  const [prefs, setPrefs] = useState<OrgPreferences | null>(null);
  const [dayAgenda, setDayAgenda] = useState<DayAgenda | null>(null);
  const [rangeAgenda, setRangeAgenda] = useState<AgendaRange | null>(null);
  const [includeCancelled, setIncludeCancelled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dayLoading, setDayLoading] = useState(true);
  const [rangeLoading, setRangeLoading] = useState(true);
  const [availabilitySettings, setAvailabilitySettings] = useState<AvailabilitySettings | null>(null);
  const [availabilityDay, setAvailabilityDay] = useState<AvailabilityDay | null>(null);
  const day = dayParam || prefs?.local_today || null;
  const timezone = prefs?.timezone || "America/Sao_Paulo";

  function setDay(next: string) {
    router.replace(`/app/agenda?day=${next}&view=${view}`);
  }

  function setView(next: View) {
    router.replace(`/app/agenda?day=${day ?? ""}&view=${next}`);
  }

  function shiftPeriod(delta: 1 | -1) {
    if (!day) return;
    setDay(shiftDay(day, view === "week" ? delta * 7 : delta));
  }

  useEffect(() => {
    void (async () => {
      const result = await apiFetch<OrgPreferences>("/api/v1/organization/preferences");
      if (result.data) {
        setPrefs(result.data);
      } else if (result.error) {
        setError(result.error.message);
        setDayLoading(false);
        setRangeLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      const result = await apiFetch<AvailabilitySettings>("/api/v1/availability/settings");
      setAvailabilitySettings(result.data ?? null);
    })();
  }, []);

  // Always fetched (not gated by `view`) — the mobile timeline shows the
  // single selected day regardless of which view the desktop grid is on,
  // so this can never go stale just because someone switched to Week.
  useEffect(() => {
    if (!day) return;
    void (async () => {
      setDayLoading(true);
      const params = new URLSearchParams({ day });
      if (includeCancelled) params.set("include_cancelled", "true");
      const result = await apiFetch<DayAgenda>(`/api/v1/agenda/day?${params}`);
      setDayLoading(false);
      if (result.error) {
        setError(result.error.message);
        return;
      }
      setDayAgenda(result.data ?? null);
      setError(null);
    })();
  }, [day, includeCancelled]);

  useEffect(() => {
    if (!day || view !== "week") return;
    void (async () => {
      setRangeLoading(true);
      const start = startOfWeekMonday(day);
      const end = addDaysToIsoDate(start, 6);
      const params = new URLSearchParams({ start_date: start, end_date: end });
      if (includeCancelled) params.set("include_cancelled", "true");
      const result = await apiFetch<AgendaRange>(`/api/v1/agenda/range?${params}`);
      setRangeLoading(false);
      if (result.error) {
        setError(result.error.message);
        return;
      }
      setRangeAgenda(result.data ?? null);
      setError(null);
    })();
  }, [day, view, includeCancelled]);

  useEffect(() => {
    if (!day) return;
    void (async () => {
      const result = await apiFetch<AvailabilityDay>(`/api/v1/availability/day?day=${day}`);
      setAvailabilityDay(result.data ?? null);
    })();
  }, [day]);

  const gridDays: CalendarGridDay[] = useMemo(() => {
    const source: DayAgenda[] = view === "week" ? rangeAgenda?.days ?? [] : dayAgenda ? [dayAgenda] : [];
    return source.map((d) => ({
      date: d.date,
      headerLabel:
        view === "week"
          ? `${WEEKDAY_SHORT[isoWeekdayMonday0(d.date)]} ${shortDayMonth(d.date)}`
          : formatHumanDate(d.date),
      appointments: d.appointments,
      daySchedule: availabilitySettings?.days.find((s) => s.weekday === isoWeekdayMonday0(d.date)) ?? null,
      isToday: prefs ? d.date === prefs.local_today : false,
      isPast: prefs ? d.date < prefs.local_today : false,
    }));
  }, [view, rangeAgenda, dayAgenda, availabilitySettings, prefs]);

  const gridBounds = useMemo(
    () =>
      computeGridBounds(
        availabilitySettings?.days ?? [],
        gridDays.flatMap((d) => d.appointments),
        timezone,
      ),
    [availabilitySettings, gridDays, timezone],
  );

  const defaultDurationMinutes = useMemo(() => {
    const active = availabilitySettings?.days.filter((d) => d.is_active) ?? [];
    return active[0]?.default_duration_minutes || 60;
  }, [availabilitySettings]);

  const totalConflicts =
    view === "week"
      ? (rangeAgenda?.days.reduce((sum, d) => sum + d.conflict_count, 0) ?? 0)
      : (dayAgenda?.conflict_count ?? 0);

  const isEmpty =
    view === "week"
      ? !!rangeAgenda && rangeAgenda.days.every((d) => d.appointments.length === 0)
      : !!dayAgenda && dayAgenda.appointments.length === 0;

  const periodLabel =
    view === "week" && day
      ? formatHumanDateRange(startOfWeekMonday(day), addDaysToIsoDate(startOfWeekMonday(day), 6))
      : day
        ? formatHumanDate(day)
        : "…";

  const todayAppointments = dayAgenda?.appointments ?? [];
  const nextAppointment = todayAppointments.find((a) => a.status !== "cancelled") ?? null;

  return (
    <div className="space-y-4 animate-fade-up">
      <BackLink href="/app" label="Início" />

      {/* Desktop: professional calendar workspace — Day/Week grid views. */}
      <div className="hidden space-y-4 lg:block">
        <div className="flex items-start justify-between gap-3">
          <div>
            <PageTitle>Agenda</PageTitle>
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
              {prefs ? `Fuso ${prefs.timezone}` : "Calendário"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/app/settings/workspace" aria-label="Configurar disponibilidade">
              <Button variant="secondary">
                <IconSliders className="mr-1.5 h-4 w-4" aria-hidden />
                Disponibilidade
              </Button>
            </Link>
            <Link href={`/app/appointments/new?day=${day ?? ""}`}>
              <Button>
                <IconCalendarPlus className="mr-1.5 h-4 w-4" aria-hidden />
                Novo compromisso
              </Button>
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)]">
              <button
                type="button"
                className={`px-3 py-1.5 text-sm font-semibold ${view === "day" ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]" : "bg-[var(--color-surface)] text-[var(--color-ink-muted)]"}`}
                onClick={() => setView("day")}
                aria-pressed={view === "day"}
              >
                Dia
              </button>
              <button
                type="button"
                className={`px-3 py-1.5 text-sm font-semibold ${view === "week" ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]" : "bg-[var(--color-surface)] text-[var(--color-ink-muted)]"}`}
                onClick={() => setView("week")}
                aria-pressed={view === "week"}
              >
                Semana
              </button>
            </div>
            <Button variant="secondary" onClick={() => shiftPeriod(-1)} disabled={!day} aria-label="Período anterior">
              <IconChevronLeft className="h-4 w-4" aria-hidden />
            </Button>
            <Button variant="secondary" onClick={() => day && setDay(prefs?.local_today ?? day)} disabled={!prefs}>
              Hoje
            </Button>
            <Button variant="secondary" onClick={() => shiftPeriod(1)} disabled={!day} aria-label="Próximo período">
              <IconChevronRight className="h-4 w-4" aria-hidden />
            </Button>
            <p className="text-sm font-semibold text-[var(--color-ink)]">{periodLabel}</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-[var(--color-ink-muted)]">
            <input
              type="checkbox"
              checked={includeCancelled}
              onChange={(e) => setIncludeCancelled(e.target.checked)}
            />
            Mostrar cancelados
          </label>
        </div>

        {availabilitySettings && !availabilitySettings.configured ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3.5 py-2.5 text-sm text-[var(--color-ink-muted)]">
            Configure seus horários de atendimento para ver disponibilidade na agenda.
            <Link href="/app/settings/workspace">
              <Button variant="secondary">Configurar horários</Button>
            </Link>
          </div>
        ) : null}

        {totalConflicts > 0 ? (
          <p
            role="status"
            className="rounded-[var(--radius-md)] border border-[var(--color-danger)]/30 bg-[var(--color-danger-subtle)] px-3 py-2 text-sm text-[var(--color-danger)]"
          >
            {view === "week"
              ? `Esta semana tem ${totalConflicts} compromisso(s) com sobreposição.`
              : `Este dia tem ${totalConflicts} compromisso(s) com sobreposição.`}
          </p>
        ) : null}

        {error ? <BlockError message={error} /> : null}

        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start lg:gap-6">
          <div className="space-y-3">
            <CalendarLegend />
            {(view === "week" ? rangeLoading : dayLoading) ? (
              <Skeleton className="h-48 w-full" />
            ) : null}
            {!(view === "week" ? rangeLoading : dayLoading) && isEmpty ? (
              <EmptyAgenda day={day} timezone={timezone} />
            ) : (
              <CalendarGrid
                days={gridDays}
                timeZone={timezone}
                gridStartMinutes={gridBounds.startMinutes}
                gridEndMinutes={gridBounds.endMinutes}
                showCancelled={includeCancelled}
                nowDate={new Date()}
                defaultDurationMinutes={defaultDurationMinutes}
                onCreateSlot={(date, start, end) =>
                  router.push(`/app/appointments/new?day=${date}&start=${start}&end=${end}`)
                }
              />
            )}
          </div>
          <div className="mt-4 space-y-3 lg:mt-0">
            {nextAppointment ? (
              <div className="rounded-[var(--radius-lg)] border border-[var(--color-primary)]/30 bg-[var(--color-primary-subtle)] px-3.5 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-primary)]">
                  Próximo compromisso
                </p>
                <p className="font-semibold text-[var(--color-ink)]">
                  {formatOrgDateTime(nextAppointment.starts_at, timezone)} · {nextAppointment.client_name}
                </p>
              </div>
            ) : null}
            <AgendaRoutines day={day} todayIso={prefs?.local_today ?? null} variant="desktop" />
          </div>
        </div>
      </div>

      {/* Mobile: daily timeline + pocket assistant — never the desktop grid compressed. */}
      <div className="space-y-3 lg:hidden" aria-label="Agenda do dia">
        <div className="flex items-center justify-between gap-2">
          <PageTitle>Agenda</PageTitle>
          <AskAssistantLink
            prompt="Sobre minha agenda: "
            context={`Agenda: ${day ? formatHumanDate(day) : "hoje"}`}
            returnTo={`/app/agenda?day=${day ?? ""}&view=${view}`}
          >
            Perguntar à Cronia
          </AskAssistantLink>
        </div>

        <div className="flex items-center justify-between gap-2">
          <Button variant="secondary" onClick={() => day && setDay(shiftDay(day, -1))} disabled={!day} aria-label="Dia anterior" className="min-h-11 px-4">
            <IconChevronLeft className="h-4 w-4" aria-hidden />
          </Button>
          <div className="text-center">
            <p className="text-sm font-semibold text-[var(--color-ink)]">{day ? formatHumanDate(day) : "…"}</p>
            {prefs && day === prefs.local_today ? (
              <p className="text-xs text-[var(--color-ink-subtle)]">Hoje</p>
            ) : (
              <button
                type="button"
                className="text-xs font-medium text-[var(--color-link)]"
                onClick={() => prefs && setDay(prefs.local_today)}
              >
                Voltar para hoje
              </button>
            )}
          </div>
          <Button variant="secondary" onClick={() => day && setDay(shiftDay(day, 1))} disabled={!day} aria-label="Próximo dia" className="min-h-11 px-4">
            <IconChevronRight className="h-4 w-4" aria-hidden />
          </Button>
        </div>

        <Link href={`/app/appointments/new?day=${day ?? ""}`}>
          <Button fullWidth>
            <IconCalendarPlus className="mr-1.5 h-4 w-4" aria-hidden />
            Agendar
          </Button>
        </Link>

        {totalConflicts > 0 ? (
          <p
            role="status"
            className="rounded-[var(--radius-md)] border border-[var(--color-danger)]/30 bg-[var(--color-danger-subtle)] px-3 py-2 text-sm text-[var(--color-danger)]"
          >
            {totalConflicts} compromisso(s) com sobreposição hoje.
          </p>
        ) : null}

        {error ? <BlockError message={error} /> : null}
        {dayLoading ? <Skeleton className="h-32 w-full" /> : null}

        {!dayLoading && nextAppointment ? (
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-primary)]/30 bg-[var(--color-primary-subtle)] px-3.5 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-primary)]">
              Próxima atividade
            </p>
            <p className="font-semibold text-[var(--color-ink)]">
              {formatOrgDateTime(nextAppointment.starts_at, timezone)} · {nextAppointment.client_name}
            </p>
          </div>
        ) : null}

        {!dayLoading && todayAppointments.length === 0 ? (
          <EmptyAgenda day={day} timezone={timezone} />
        ) : null}

        {todayAppointments.length > 0 ? (
          <ul className="space-y-2.5">
            {todayAppointments
              .filter((a) => includeCancelled || a.status !== "cancelled")
              .map((appt) => (
                <MobileAppointmentRow key={appt.id} appt={appt} timezone={timezone} />
              ))}
          </ul>
        ) : null}

        <details className="group rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-3">
          <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-[var(--color-ink)]">
            {availabilityDay?.slots.length
              ? `${availabilityDay.slots.length} horário(s) livre(s) hoje`
              : "Horários livres hoje"}
          </summary>
          <div className="mt-2.5">
            {!availabilityDay || !availabilityDay.configured ? (
              <div className="space-y-2">
                <p className="text-sm text-[var(--color-ink-muted)]">
                  Configure seus horários de atendimento para ver disponibilidade.
                </p>
                <Link href="/app/settings/workspace">
                  <Button variant="secondary">Configurar horários</Button>
                </Link>
              </div>
            ) : !availabilityDay.is_active || availabilityDay.slots.length === 0 ? (
              <p className="text-sm text-[var(--color-ink-muted)]">Nenhum horário disponível neste dia.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {availabilityDay.slots.map((slot) => {
                  const startLabel = slot.label;
                  const endLabel = formatOrgDateTime(slot.ends_at, availabilityDay.timezone);
                  return (
                    <li key={slot.starts_at}>
                      <Link
                        href={`/app/appointments/new?day=${day ?? ""}&start=${startLabel}&end=${endLabel}`}
                        className="inline-flex min-h-9 items-center rounded-full border border-[var(--color-success)]/40 bg-[var(--color-success-subtle)] px-3 text-sm font-semibold text-[var(--color-success)]"
                      >
                        {startLabel} · Disponível
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </details>

        <AgendaRoutines day={day} todayIso={prefs?.local_today ?? null} variant="mobile" />
      </div>
    </div>
  );
}
