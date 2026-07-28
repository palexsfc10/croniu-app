"use client";

import { BackLink } from "@/components/app/back-link";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  apiFetch,
  appointmentStatusLabel,
  formatOrgDateTime,
  type DayAgenda,
  type OrgPreferences,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

function shiftDay(isoDay: string, delta: number) {
  const [y, m, d] = isoDay.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

export default function AgendaPage() {
  const [prefs, setPrefs] = useState<OrgPreferences | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [agenda, setAgenda] = useState<DayAgenda | null>(null);
  const [includeCancelled, setIncludeCancelled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const result = await apiFetch<OrgPreferences>("/api/v1/organization/preferences");
      if (result.data) {
        setPrefs(result.data);
        setDay(result.data.local_today);
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
      <p className="text-sm font-semibold text-[var(--color-ink)]">{day ?? "…"}</p>

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
          className="rounded-[var(--radius-md)] border border-[var(--color-warning)]/40 bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-warning)]"
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
        <EmptyState
          title="Nenhum compromisso"
          description="Crie um compromisso único para este dia."
          action={
            <Link href={`/app/appointments/new?day=${day ?? ""}`}>
              <Button variant="secondary">Criar compromisso</Button>
            </Link>
          }
        />
      ) : null}

      <ul className="space-y-2">
        {agenda?.appointments.map((item) => (
          <li key={item.id}>
            <Link
              href={`/app/appointments/${item.id}`}
              className="block rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3"
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
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
