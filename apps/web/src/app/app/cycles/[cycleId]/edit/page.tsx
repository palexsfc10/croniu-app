"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  WEEKDAY_OPTIONS,
  apiFetch,
  formatBRL,
  type Cycle,
  type CyclePreview,
} from "@/lib/api";
import { lastInclusiveIso } from "@/lib/date-format";
import { BackLink } from "@/components/app/back-link";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";

export default function EditCyclePage() {
  const params = useParams<{ cycleId: string }>();
  const router = useRouter();
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [notes, setNotes] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [preview, setPreview] = useState<CyclePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await apiFetch<Cycle>(`/api/v1/cycles/${params.cycleId}`);
      if (cancelled) return;
      if (result.error) {
        setError(result.error.message);
        return;
      }
      const row = result.data;
      if (!row) return;
      setCycle(row);
      setNotes(row.notes ?? "");
      setStartsOn(row.starts_on);
      setWeekdays(row.weekdays ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [params.cycleId]);

  function toggleDay(day: number) {
    setWeekdays((prev) => {
      if (prev.includes(day)) return prev.filter((d) => d !== day);
      const limit = cycle?.weekly_frequency ?? 7;
      if (prev.length >= limit) return prev;
      return [...prev, day].sort((a, b) => a - b);
    });
    setPreview(null);
  }

  async function loadPreview() {
    if (!cycle || cycle.is_legacy || !cycle.cycle_template_id) return;
    setError(null);
    const result = await apiFetch<CyclePreview>("/api/v1/cycles/preview", {
      method: "POST",
      body: JSON.stringify({
        service_id: cycle.service_id,
        cycle_template_id: cycle.cycle_template_id,
        starts_on: startsOn,
        weekdays,
        unit_price_cents: cycle.unit_price_cents,
        adjustment_cents: cycle.adjustment_cents ?? 0,
        lesson_duration_minutes: cycle.lesson_duration_minutes,
      }),
    });
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setPreview(result.data ?? null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!cycle) return;
    setSaving(true);
    setError(null);

    const body: Record<string, unknown> = { notes: notes || null };
    if (!cycle.is_legacy) {
      const weekdaysChanged =
        JSON.stringify([...(cycle.weekdays ?? [])].sort((a, b) => a - b)) !==
        JSON.stringify([...weekdays].sort((a, b) => a - b));
      const startsChanged = startsOn !== cycle.starts_on;
      if (startsChanged) body.starts_on = startsOn;
      if (weekdaysChanged) body.weekdays = weekdays;
      if ((startsChanged || weekdaysChanged) && cycle.weekly_frequency != null) {
        if (weekdays.length !== cycle.weekly_frequency) {
          setSaving(false);
          setError(`Selecione exatamente ${cycle.weekly_frequency} dia(s) da semana.`);
          return;
        }
      }
    }

    const result = await apiFetch<Cycle>(`/api/v1/cycles/${cycle.id}/intelligent`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    router.replace(`/app/cycles/${cycle.id}`);
  }

  return (
    <div className="space-y-4 animate-fade-up">
      <BackLink href={`/app/cycles/${params.cycleId}`} label="Ciclo" />
      <h1 className="h-display text-3xl text-[var(--color-ink)]">Editar ciclo</h1>
      {cycle?.is_legacy ? (
        <p className="text-sm text-[var(--color-ink-muted)]">
          Ciclo legado: só observações. Para alterar datas ou valores, crie um ciclo novo.
        </p>
      ) : (
        <p className="text-sm text-[var(--color-ink-muted)]">
          Mudanças de datas/dias recalculam o ciclo. Compromissos já gerados na Agenda não são
          sincronizados automaticamente.
        </p>
      )}

      {!cycle && !error ? (
        <p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p>
      ) : null}

      {cycle ? (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <p className="text-sm text-[var(--color-ink-muted)]">
            {cycle.client_name} · {cycle.service_name}
          </p>

          {!cycle.is_legacy ? (
            <>
              <TextField
                label="Início"
                type="date"
                value={startsOn}
                onChange={(e) => {
                  setStartsOn(e.target.value);
                  setPreview(null);
                }}
                required
              />
              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-[var(--color-ink)]">
                  Dias da semana
                  {cycle.weekly_frequency != null ? ` (${cycle.weekly_frequency})` : ""}
                </legend>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAY_OPTIONS.map((d) => {
                    const on = weekdays.includes(d.value);
                    return (
                      <button
                        key={d.value}
                        type="button"
                        onClick={() => toggleDay(d.value)}
                        className={[
                          "min-h-11 rounded-[var(--radius-md)] px-3 text-sm font-semibold",
                          on
                            ? "bg-[var(--color-primary)] text-white"
                            : "border border-[var(--color-border)] bg-[var(--color-surface)]",
                        ].join(" ")}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <Button type="button" variant="secondary" fullWidth onClick={() => void loadPreview()}>
                Pré-visualizar
              </Button>
              {preview ? (
                <p className="rounded-[var(--radius-md)] bg-[var(--color-surface-muted)] px-3 py-2 text-sm">
                  {preview.lesson_count} aulas · {formatBRL(preview.final_cents)} · vigência até{" "}
                  {lastInclusiveIso(preview.ends_on)} · renovação {preview.ends_on}
                </p>
              ) : null}
            </>
          ) : null}

          <TextField
            label="Observações"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          {error ? (
            <p role="alert" className="text-sm text-[var(--color-danger)]">
              {error}
            </p>
          ) : null}

          <Button type="submit" fullWidth disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
          {!cycle.is_legacy ? (
            <Link href={`/app/cycles/${cycle.id}/financial`} className="block">
              <Button type="button" fullWidth>
                Editar valores
              </Button>
            </Link>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
