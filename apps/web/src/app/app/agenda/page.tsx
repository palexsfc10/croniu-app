"use client";

import { BackLink } from "@/components/app/back-link";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  apiFetch,
  appointmentStatusLabel,
  formatOrgDateTime,
  type DayAgenda,
  type OrgPreferences,
} from "@/lib/api";
import { formatHumanDate, formatNextLessonLine } from "@/lib/date-format";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

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
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-accent)]">
                  Rotina{item.overdue ? " · vencida" : ""}
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

export default function AgendaPage() {
  const router = useRouter();
  const search = useSearchParams();
  const dayParam = search.get("day");
  const [prefs, setPrefs] = useState<OrgPreferences | null>(null);
  const [agenda, setAgenda] = useState<DayAgenda | null>(null);
  const [includeCancelled, setIncludeCancelled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const day = dayParam || prefs?.local_today || null;

  function setDay(next: string) {
    router.replace(`/app/agenda?day=${next}`);
  }

  useEffect(() => {
    void (async () => {
      const result = await apiFetch<OrgPreferences>("/api/v1/organization/preferences");
      if (result.data) {
        setPrefs(result.data);
      } else if (result.error) {
        setError(result.error.message);
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!day) return;
    void (async () => {
      setLoading(true);
      const params = new URLSearchParams({ day });
      if (includeCancelled) params.set("include_cancelled", "true");
      const result = await apiFetch<DayAgenda>(`/api/v1/agenda/day?${params}`);
      setLoading(false);
      if (result.error) {
        setError(result.error.message);
        return;
      }
      setAgenda(result.data ?? null);
      setError(null);
    })();
  }, [day, includeCancelled]);

  return (
    <div className="space-y-4 animate-fade-up">
      <BackLink href="/app" label="Hoje" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="h-display text-3xl text-[var(--color-ink)]">Agenda</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            {prefs ? `Fuso ${prefs.timezone}` : "Visão diária"}
          </p>
        </div>
        <Link href="/app/appointments/new">
          <Button>Novo</Button>
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          onClick={() => day && setDay(shiftDay(day, -1))}
          disabled={!day}
        >
          Anterior
        </Button>
        <Button
          variant="secondary"
          onClick={() => prefs && setDay(prefs.local_today)}
          disabled={!prefs}
        >
          Hoje
        </Button>
        <Button
          variant="secondary"
          onClick={() => day && setDay(shiftDay(day, 1))}
          disabled={!day}
        >
          Próximo
        </Button>
      </div>
      <p className="text-sm font-semibold text-[var(--color-ink)]">
        {day ? formatHumanDate(day) : "…"}
      </p>

      <label className="flex items-center gap-2 text-sm text-[var(--color-ink-muted)]">
        <input
          type="checkbox"
          checked={includeCancelled}
          onChange={(e) => setIncludeCancelled(e.target.checked)}
        />
        Mostrar cancelados
      </label>

      {agenda && agenda.conflict_count > 0 ? (
        <p
          role="status"
          className="rounded-[var(--radius-md)] border border-[var(--color-danger)]/30 bg-[var(--color-danger-subtle)] px-3 py-2 text-sm text-[var(--color-danger)]"
        >
          Este dia tem {agenda.conflict_count} compromisso(s) com sobreposição.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
      {loading ? <p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p> : null}

      {!loading && agenda && agenda.appointments.length === 0 ? (
        <EmptyAgenda day={day} timezone={agenda.timezone || prefs?.timezone || "America/Sao_Paulo"} />
      ) : null}

      {agenda && agenda.appointments.length > 0 ? (
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
          Compromissos
        </h2>
      ) : null}
      <ul className="space-y-2">
        {agenda?.appointments.map((item) => (
          <li key={item.id}>
            <Link
              href={`/app/appointments/${item.id}`}
              className="card-rail card-rail-primary block rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3 transition-colors hover:bg-[var(--color-primary-subtle)]/35"
            >
              <p className="font-semibold text-[var(--color-ink)]">
                {formatOrgDateTime(item.starts_at, agenda.timezone)}–
                {formatOrgDateTime(item.ends_at, agenda.timezone)} · {item.client_name}
              </p>
              <p className="text-sm text-[var(--color-ink-muted)]">
                {item.location_name || "Sem local"} · {appointmentStatusLabel(item.status)}
                {item.service_name || item.cycle_service_name
                  ? ` · ${item.service_name || item.cycle_service_name}`
                  : ""}
              </p>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
                Atendimento
              </p>
            </Link>
          </li>
        ))}
      </ul>
      <AgendaRoutines day={day} />
    </div>
  );
}
