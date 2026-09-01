"use client";

import { BackLink } from "@/components/app/back-link";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import {
  apiFetch,
  WEEKDAY_OPTIONS,
  type AvailabilitySettings,
  type DaySchedule,
} from "@/lib/api";
import { useEffect, useState } from "react";

const DURATION_OPTIONS = [30, 45, 60, 90];
const FULL_WEEKDAY_LABELS = [
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
  "Domingo",
];

function defaultDay(weekday: number): DaySchedule {
  const active = weekday < 5;
  return {
    weekday,
    is_active: active,
    starts_time: "08:00",
    ends_time: "18:00",
    break_starts_time: active ? "12:00" : null,
    break_ends_time: active ? "13:00" : null,
    default_duration_minutes: 60,
  };
}

function defaultWeek(): DaySchedule[] {
  return WEEKDAY_OPTIONS.map((opt) => defaultDay(opt.value));
}

export default function AvailabilityPage() {
  const [days, setDays] = useState<DaySchedule[]>(defaultWeek());
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void (async () => {
      const result = await apiFetch<AvailabilitySettings>("/api/v1/availability/settings");
      if (result.data) {
        setConfigured(result.data.configured);
        if (result.data.configured && result.data.days.length === 7) {
          setDays([...result.data.days].sort((a, b) => a.weekday - b.weekday));
        }
      } else if (result.error) {
        setError(result.error.message);
      }
      setLoading(false);
    })();
  }, []);

  function updateDay(weekday: number, patch: Partial<DaySchedule>) {
    setDays((prev) => prev.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)));
    setSaved(false);
  }

  function applyMondayToWeekdays() {
    const monday = days.find((d) => d.weekday === 0);
    if (!monday) return;
    setDays((prev) =>
      prev.map((d) =>
        d.weekday >= 1 && d.weekday <= 4
          ? {
              ...d,
              is_active: monday.is_active,
              starts_time: monday.starts_time,
              ends_time: monday.ends_time,
              break_starts_time: monday.break_starts_time,
              break_ends_time: monday.break_ends_time,
              default_duration_minutes: monday.default_duration_minutes,
            }
          : d,
      ),
    );
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    const result = await apiFetch<AvailabilitySettings>("/api/v1/availability/settings", {
      method: "PUT",
      body: JSON.stringify({ days }),
    });
    setSaving(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    if (result.data) {
      setConfigured(result.data.configured);
      setSaved(true);
    }
  }

  return (
    <div className="space-y-4 animate-fade-up">
      <BackLink href="/app/profile" label="Mais" />
      <div>
        <div className="flex items-center gap-2">
          <h1 className="h-display text-3xl text-[var(--color-ink)]">Horários de atendimento</h1>
          {configured ? (
            <span className="rounded-full bg-[var(--color-success-subtle)] px-2 py-0.5 text-xs font-semibold text-[var(--color-success)]">
              Configurado
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Configure seus horários de atendimento para que o Croniu identifique vagas disponíveis
          na sua agenda.
        </p>
      </div>

      {loading ? <p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p> : null}

      {!loading ? (
        <>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={applyMondayToWeekdays}>
              Aplicar segunda aos dias úteis
            </Button>
          </div>

          <div className="space-y-3">
            {WEEKDAY_OPTIONS.map((opt) => {
              const day = days.find((d) => d.weekday === opt.value);
              if (!day) return null;
              return (
                <div
                  key={opt.value}
                  className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-[var(--color-ink)]">
                      {FULL_WEEKDAY_LABELS[opt.value]}
                    </span>
                    <label className="flex min-h-9 items-center gap-2 text-sm text-[var(--color-ink-muted)]">
                      <input
                        type="checkbox"
                        checked={day.is_active}
                        onChange={(e) => updateDay(opt.value, { is_active: e.target.checked })}
                      />
                      Atende
                    </label>
                  </div>

                  {day.is_active ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <TextField
                          label="Início"
                          type="time"
                          value={day.starts_time.slice(0, 5)}
                          onChange={(e) => updateDay(opt.value, { starts_time: e.target.value })}
                        />
                        <TextField
                          label="Fim"
                          type="time"
                          value={day.ends_time.slice(0, 5)}
                          onChange={(e) => updateDay(opt.value, { ends_time: e.target.value })}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <TextField
                          label="Intervalo — início"
                          type="time"
                          value={day.break_starts_time?.slice(0, 5) ?? ""}
                          onChange={(e) =>
                            updateDay(opt.value, {
                              break_starts_time: e.target.value || null,
                              break_ends_time:
                                e.target.value ? day.break_ends_time || day.ends_time : null,
                            })
                          }
                        />
                        <TextField
                          label="Intervalo — fim"
                          type="time"
                          value={day.break_ends_time?.slice(0, 5) ?? ""}
                          onChange={(e) =>
                            updateDay(opt.value, { break_ends_time: e.target.value || null })
                          }
                        />
                      </div>
                      <label className="block space-y-1.5 text-sm">
                        <span className="font-medium text-[var(--color-ink)]">
                          Duração padrão do atendimento
                        </span>
                        <select
                          className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
                          value={day.default_duration_minutes}
                          onChange={(e) =>
                            updateDay(opt.value, {
                              default_duration_minutes: Number(e.target.value),
                            })
                          }
                        >
                          {DURATION_OPTIONS.map((m) => (
                            <option key={m} value={m}>
                              {m} minutos
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--color-ink-subtle)]">
                      Sem atendimento neste dia.
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {error ? (
            <p role="alert" className="text-sm text-[var(--color-danger)]">
              {error}
            </p>
          ) : null}
          {saved ? (
            <p role="status" className="text-sm text-[var(--color-success)]">
              Horários salvos.
            </p>
          ) : null}
          <Button fullWidth onClick={() => void save()} disabled={saving}>
            {saving ? "Salvando…" : "Salvar horários"}
          </Button>
        </>
      ) : null}
    </div>
  );
}
