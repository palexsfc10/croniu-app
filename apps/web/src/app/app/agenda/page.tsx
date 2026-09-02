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
  IconSparkles,
} from "@/components/ui/icons";

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
  return (
    <EmptyState
      title={`Nenhum compromisso em ${dayLabel}`}
      description={nextLine ?? "Não há aula nesta data."}
      action={
        <div className="flex w-full flex-col gap-2">
          {nextDay ? (
            <Link
              href={`/app/agenda?day=${nextDay}`}
              className="btn-primary inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius-md)] px-4 text-sm font-semibold"
            >
              Ver próxima aula
            </Link>
          ) : null}
          <Link href={`/app/appointments/new?day=${day ?? ""}`}>
            <Button fullWidth variant="secondary">
              Criar compromisso
            </Button>
          </Link>
        </div>
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

function AgendaRoutines({ day }: { day: string | null }) {
  const [groups, setGroups] = useState<
    Array<{
      label: string;
      count: number;
      occurrence_count?: number;
      occurrence_type: string;
      items?: Array<{
        id: string;
        name?: string | null;
        client_id?: string | null;
        client_name?: string | null;
        overdue?: boolean;
        time?: string | null;
        type_label?: string;
        due_on?: string;
      }>;
    }>
  >([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    if (!day) return;
    const result = await apiFetch<{
      today: string;
      groups: Array<{
        label: string;
        count: number;
        occurrence_type: string;
        items?: Array<{
          id: string;
          name?: string | null;
          client_id?: string | null;
          client_name?: string | null;
          overdue?: boolean;
          time?: string | null;
          type_label?: string;
          due_on?: string;
        }>;
      }>;
    }>(`/api/v1/routines/board?on=${day}`);
    setGroups(result.data?.groups ?? []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- remote hydrate
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  async function decide(id: string, status: "completed" | "deferred") {
    setBusyId(id);
    const body: { status: string; deferred_until?: string } = { status };
    if (status === "deferred" && day) {
      const next = shiftDay(day, 1);
      body.deferred_until = next;
    }
    await apiFetch(`/api/v1/routines/occurrences/${id}/decide`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    setBusyId(null);
    await load();
  }

  if (!groups.length) return null;
  return (
    <section className="space-y-2" aria-label="Ações da rotina">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
        Ações da rotina
      </h2>
      <ul className="space-y-2">
        {groups.flatMap((g) =>
          (g.items && g.items.length ? g.items : [{ id: g.occurrence_type, type_label: g.label }]).map(
            (item) => (
              <li
                key={item.id}
                className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3 py-3"
              >
                <p className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-accent)]">
                  Rotina
                  {item.overdue ? <Badge tone="danger">Vencida</Badge> : null}
                </p>
                <p className="font-semibold">{item.name || item.type_label || g.label}</p>
                <p className="text-sm text-[var(--color-ink-muted)]">
                  {item.time ? `${item.time} · ` : "Ação do dia · "}
                  {item.client_name || "Clientes ativos"}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {item.client_id ? (
                    <Link
                      href={`/app/clients/${item.client_id}`}
                      className="text-sm text-[var(--color-link)]"
                    >
                      Abrir cliente
                    </Link>
                  ) : (
                    <Link href="/app/routines" className="text-sm text-[var(--color-link)]">
                      Abrir rotinas
                    </Link>
                  )}
                  {item.id.includes("-") ? (
                    <>
                      <button
                        type="button"
                        className="text-sm font-medium text-[var(--color-primary)]"
                        disabled={busyId === item.id}
                        onClick={() => void decide(item.id, "completed")}
                      >
                        Concluir
                      </button>
                      <button
                        type="button"
                        className="text-sm font-medium text-[var(--color-ink-muted)]"
                        disabled={busyId === item.id}
                        onClick={() => void decide(item.id, "deferred")}
                      >
                        Adiar
                      </button>
                    </>
                  ) : null}
                </div>
              </li>
            ),
          ),
        )}
      </ul>
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
            <h1 className="h-display text-3xl text-[var(--color-ink)]">Agenda</h1>
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
              {prefs ? `Fuso ${prefs.timezone}` : "Calendário"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/app/availability" aria-label="Configurar disponibilidade">
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
                className={`px-3 py-1.5 text-sm font-semibold ${view === "day" ? "bg-[var(--color-primary)] text-[var(--color-on-primary)]" : "bg-[var(--color-surface)] text-[var(--color-ink-muted)]"}`}
                onClick={() => setView("day")}
                aria-pressed={view === "day"}
              >
                Dia
              </button>
              <button
                type="button"
                className={`px-3 py-1.5 text-sm font-semibold ${view === "week" ? "bg-[var(--color-primary)] text-[var(--color-on-primary)]" : "bg-[var(--color-surface)] text-[var(--color-ink-muted)]"}`}
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
            <Link href="/app/availability">
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

        {error ? (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {error}
          </p>
        ) : null}

        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start lg:gap-6">
          <div className="space-y-3">
            <CalendarLegend />
            {(view === "week" ? rangeLoading : dayLoading) ? (
              <p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p>
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
          <div className="mt-4 lg:mt-0">
            <AgendaRoutines day={day} />
          </div>
        </div>
      </div>

      {/* Mobile: daily timeline + pocket assistant — never the desktop grid compressed. */}
      <div className="space-y-3 lg:hidden" aria-label="Agenda do dia">
        <div className="flex items-center justify-between gap-2">
          <h1 className="h-display text-2xl text-[var(--color-ink)]">Agenda</h1>
          <Link href={`/app/assistant?prompt=${encodeURIComponent("Sobre minha agenda: ")}`}>
            <Button variant="secondary" className="min-h-10 px-3 text-sm">
              <IconSparkles className="mr-1.5 h-4 w-4" aria-hidden />
              Perguntar à IA
            </Button>
          </Link>
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

        {error ? (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {error}
          </p>
        ) : null}
        {dayLoading ? <p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p> : null}

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
                <Link href="/app/availability">
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

        <AgendaRoutines day={day} />
      </div>
    </div>
  );
}
