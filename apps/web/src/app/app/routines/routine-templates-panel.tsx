"use client";

import { useEffect, useState, type ComponentType, type SVGProps } from "react";
import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { TextField } from "@/components/ui/text-field";
import {
  IconActivity,
  IconCalendarDays,
  IconClipboardList,
  IconPhone,
  IconRefreshCw,
  IconSend,
} from "@/components/ui/icons";

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

type EnabledRoutine = {
  id: string;
  name: string;
  recurrence: string;
  next_run_on: string | null;
  status: string;
};

type Props = {
  enabled: EnabledRoutine[];
  onChanged: () => Promise<void>;
};

const FREQ = [
  { value: "weekly", label: "Toda semana" },
  { value: "biweekly", label: "A cada 15 dias" },
  { value: "monthly", label: "Uma vez por mês" },
  { value: "bimonthly", label: "A cada 2 meses" },
  { value: "quarterly", label: "A cada 3 meses" },
  { value: "interval", label: "Personalizado" },
  { value: "once", label: "Uma única vez" },
];

function freqLabel(tpl: Template) {
  if (tpl.trigger_type === "cycle_lifecycle") {
    if (tpl.offset_days) return `${tpl.offset_days} dias antes do encerramento`;
    return "Relativo ao ciclo";
  }
  return FREQ.find((f) => f.value === tpl.recurrence)?.label || tpl.recurrence;
}

function iconFor(taskType: string): ComponentType<SVGProps<SVGSVGElement>> {
  if (taskType === "send_feedback") return IconSend;
  if (taskType === "prepare_renewal") return IconRefreshCw;
  if (taskType === "review_evaluation") return IconActivity;
  if (taskType === "contact_client") return IconPhone;
  if (taskType === "review_protocol") return IconClipboardList;
  return IconCalendarDays;
}

export function RoutineTemplatesPanel({ enabled, onChanged }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [sheet, setSheet] = useState<Template | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [weekday, setWeekday] = useState(1);
  const [recurrence, setRecurrence] = useState("weekly");
  const [startsOn, setStartsOn] = useState("");
  const [time, setTime] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enabledByName = new Map(enabled.map((row) => [row.name, row]));

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

  async function loadPreview(tpl: Template, rec: string) {
    const result = await apiFetch<{ preview: string }>("/api/v1/routines/preview", {
      method: "POST",
      body: JSON.stringify({
        name: tpl.name,
        task_type: tpl.task_type,
        recurrence: tpl.trigger_type === "cycle_lifecycle" ? "once" : rec,
        weekday,
        filter_json: filterJson(tpl),
      }),
    });
    setPreview(result.data?.preview ?? null);
  }

  function openSheet(tpl: Template, routineId: string | null) {
    setSheet(tpl);
    setEditingId(routineId);
    setRecurrence(tpl.recurrence);
    setPreview(null);
    void loadPreview(tpl, tpl.recurrence);
  }

  async function enableNow(tpl: Template) {
    setBusy(true);
    setError(null);
    const rec = tpl.trigger_type === "cycle_lifecycle" ? "once" : tpl.recurrence;
    const result = await apiFetch("/api/v1/routines", {
      method: "POST",
      body: JSON.stringify({
        name: tpl.name,
        task_type: tpl.task_type,
        recurrence: rec,
        weekday,
        filter_json: filterJson(tpl),
        next_run_on: rec === "once" && startsOn ? startsOn : null,
      }),
    });
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setSheet(null);
    await onChanged();
  }

  async function saveSheet() {
    if (!sheet) return;
    setBusy(true);
    setError(null);
    const rec = sheet.trigger_type === "cycle_lifecycle" ? "once" : recurrence;
    if (editingId) {
      const result = await apiFetch(`/api/v1/routines/${editingId}`, {
        method: "PATCH",
        body: JSON.stringify({
          recurrence: rec,
          weekday,
          filter_json: filterJson(sheet),
          recompute: true,
        }),
      });
      setBusy(false);
      if (result.error) {
        setError(result.error.message);
        return;
      }
    } else {
      const result = await apiFetch("/api/v1/routines", {
        method: "POST",
        body: JSON.stringify({
          name: sheet.name,
          task_type: sheet.task_type,
          recurrence: rec,
          weekday,
          filter_json: filterJson(sheet),
          next_run_on: rec === "once" && startsOn ? startsOn : null,
        }),
      });
      setBusy(false);
      if (result.error) {
        setError(result.error.message);
        return;
      }
    }
    setSheet(null);
    await onChanged();
  }

  function onToggle(tpl: Template, on: boolean) {
    if (on) return;
    if (tpl.trigger_type === "cycle_lifecycle") {
      void enableNow(tpl);
      return;
    }
    openSheet(tpl, null);
  }

  return (
    <section className="space-y-3" aria-label="Sugestões para você">
      <header>
        <h2 className="text-lg font-semibold">Sugestões para você</h2>
        <p className="text-sm text-[var(--color-ink-muted)]">
          Ative apenas o que fizer parte do seu trabalho.
        </p>
      </header>
      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
      <ul className="grid gap-2">
        {templates.map((tpl) => {
          const row = enabledByName.get(tpl.name);
          const on = Boolean(row && row.status === "active");
          const Icon = iconFor(tpl.task_type);
          return (
            <li
              key={tpl.id}
              className={[
                "flex min-h-[7.5rem] items-stretch rounded-[var(--radius-md)] border px-3 py-3",
                on
                  ? "border-[var(--color-primary)]/35 bg-[var(--color-primary-subtle)]"
                  : "border-[var(--color-border)] bg-[var(--color-surface)]",
              ].join(" ")}
            >
              <div className="flex min-w-0 flex-1 gap-3">
                <span className="mt-0.5 text-[var(--color-ink-muted)]" aria-hidden>
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold leading-tight">{tpl.name}</p>
                    {on ? <Badge tone="success">Ativa</Badge> : null}
                  </div>
                  <p className="text-sm leading-snug text-[var(--color-ink-muted)]">
                    {tpl.description}
                  </p>
                  <p className="text-xs text-[var(--color-ink-muted)]">{freqLabel(tpl)}</p>
                  {on && row ? (
                    <button
                      type="button"
                      className="min-h-11 text-sm font-medium text-[var(--color-link)]"
                      onClick={() => openSheet(tpl, row.id)}
                    >
                      Editar
                    </button>
                  ) : null}
                </div>
              </div>
              <Switch
                checked={on}
                disabled={on || busy}
                label={`Ativar ${tpl.name}`}
                onCheckedChange={() => onToggle(tpl, on)}
              />
            </li>
          );
        })}
      </ul>

      {sheet ? (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="routine-activate-title"
        >
          <div className="w-full max-w-md space-y-3 rounded-[var(--radius-lg)] bg-[var(--color-surface)] p-4 shadow-lg">
            <h2 id="routine-activate-title" className="text-base font-semibold">
              {sheet.name}
            </h2>
            {sheet.trigger_type === "calendar" ? (
              <>
                <label className="block text-sm">
                  Frequência
                  <select
                    className="mt-1 min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] px-2"
                    value={recurrence}
                    onChange={(e) => {
                      setRecurrence(e.target.value);
                      void loadPreview(sheet, e.target.value);
                    }}
                  >
                    {FREQ.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </label>
                {recurrence === "weekly" || recurrence === "biweekly" ? (
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
                ) : null}
              </>
            ) : (
              <p className="text-sm text-[var(--color-ink-muted)]">{freqLabel(sheet)}</p>
            )}
            {recurrence === "once" && sheet.trigger_type === "calendar" ? (
              <TextField
                label="Data"
                type="date"
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
              />
            ) : null}
            <TextField
              label="Horário (opcional)"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
            {preview ? (
              <p className="text-sm text-[var(--color-ink)]">{preview}</p>
            ) : null}
            <div className="flex flex-col gap-2">
              <Button type="button" disabled={busy} onClick={() => void saveSheet()}>
                Salvar
              </Button>
              <Button type="button" variant="ghost" onClick={() => setSheet(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
