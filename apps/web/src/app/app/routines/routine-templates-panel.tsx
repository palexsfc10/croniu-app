"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";

type Template = {
  id: string;
  name: string;
  task_type: string;
  description: string;
  recurrence: string;
  trigger_type: string;
  anchor?: string;
  offset_days?: number;
};

type Props = {
  enabledNames: Set<string>;
  onChanged: () => Promise<void>;
};

const FREQ = [
  { value: "weekly", label: "Semanal" },
  { value: "biweekly", label: "Quinzenal" },
  { value: "monthly", label: "Mensal" },
  { value: "once", label: "Uma vez" },
];

export function RoutineTemplatesPanel({ enabledNames, onChanged }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [weekday, setWeekday] = useState(1);
  const [recurrence, setRecurrence] = useState("weekly");
  const [startsOn, setStartsOn] = useState("");
  const [time, setTime] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const result = await apiFetch<{ items: Template[] }>("/api/v1/routines/templates");
      setTemplates(result.data?.items ?? []);
    })();
  }, []);

  function filterJson(tpl: Template) {
    return {
      trigger_type: tpl.trigger_type,
      anchor: tpl.anchor,
      offset_days: tpl.offset_days ?? 0,
      weekdays: [weekday],
      starts_on: startsOn || null,
      no_end: true,
      time: time || null,
    };
  }

  async function loadPreview(tpl: Template) {
    const result = await apiFetch<{ preview: string }>("/api/v1/routines/preview", {
      method: "POST",
      body: JSON.stringify({
        name: tpl.name,
        task_type: tpl.task_type,
        recurrence: tpl.trigger_type === "cycle_lifecycle" ? "once" : recurrence,
        weekday,
        filter_json: filterJson(tpl),
      }),
    });
    setPreview(result.data?.preview ?? null);
  }

  async function enable(tpl: Template) {
    setBusy(true);
    setError(null);
    const result = await apiFetch("/api/v1/routines", {
      method: "POST",
      body: JSON.stringify({
        name: tpl.name,
        task_type: tpl.task_type,
        recurrence: tpl.trigger_type === "cycle_lifecycle" ? "once" : recurrence,
        weekday,
        filter_json: filterJson(tpl),
        next_run_on: recurrence === "once" && startsOn ? startsOn : null,
      }),
    });
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setEditing(null);
    await onChanged();
  }

  return (
    <section className="space-y-3" aria-label="Escolha o que o Croniu deve lembrar">
      <header>
        <h2 className="text-lg font-semibold">Escolha o que o Croniu deve lembrar</h2>
        <p className="text-sm text-[var(--color-ink-muted)]">
          Ative apenas o que fizer parte da sua rotina. Você poderá ajustar a frequência.
        </p>
      </header>
      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
      <ul className="space-y-2">
        {templates.map((tpl) => {
          const on = enabledNames.has(tpl.name);
          return (
            <li
              key={tpl.id}
              className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{tpl.name}</p>
                  <p className="text-sm text-[var(--color-ink-muted)]">{tpl.description}</p>
                  <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                    {tpl.trigger_type === "cycle_lifecycle"
                      ? "Relativo ao ciclo"
                      : FREQ.find((f) => f.value === tpl.recurrence)?.label || tpl.recurrence}
                  </p>
                </div>
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    role="switch"
                    aria-label={`Ativar ${tpl.name}`}
                    checked={on}
                    disabled={on || busy}
                    onChange={() => {
                      setEditing(tpl.id);
                      setRecurrence(tpl.recurrence);
                      void loadPreview(tpl);
                    }}
                  />
                  {on ? "Ativa" : "Ativar"}
                </label>
              </div>
              {editing === tpl.id && !on ? (
                <div className="mt-3 space-y-2 border-t border-[var(--color-border)] pt-3">
                  {tpl.trigger_type === "calendar" ? (
                    <>
                      <label className="block text-sm">
                        Frequência
                        <select
                          className="mt-1 min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] px-2"
                          value={recurrence}
                          onChange={(e) => {
                            setRecurrence(e.target.value);
                            void loadPreview({ ...tpl, recurrence: e.target.value });
                          }}
                        >
                          {FREQ.map((f) => (
                            <option key={f.value} value={f.value}>
                              {f.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-sm">
                        Dia da semana
                        <select
                          className="mt-1 min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] px-2"
                          value={weekday}
                          onChange={(e) => setWeekday(Number(e.target.value))}
                        >
                          <option value={0}>Segunda</option>
                          <option value={1}>Terça</option>
                          <option value={2}>Quarta</option>
                          <option value={3}>Quinta</option>
                          <option value={4}>Sexta</option>
                        </select>
                      </label>
                    </>
                  ) : null}
                  <TextField
                    label="Data inicial (opcional)"
                    type="date"
                    value={startsOn}
                    onChange={(e) => setStartsOn(e.target.value)}
                  />
                  <TextField
                    label="Horário (opcional)"
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                  />
                  {preview ? (
                    <p className="text-sm text-[var(--color-ink)]">{preview}</p>
                  ) : null}
                  <Button type="button" disabled={busy} onClick={() => void enable(tpl)}>
                    Salvar
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
