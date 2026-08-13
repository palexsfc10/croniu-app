"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { safeReturnTo } from "@/lib/nomenclature";
import { BackLink } from "@/components/app/back-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";

type Routine = {
  id: string;
  name: string;
  task_type: string;
  weekday: number | null;
  recurrence: string;
  lead_days: number;
  next_run_on: string | null;
  status: string;
};

const WEEKDAYS = [
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
  "Domingo",
];

const TASK_TYPES = [
  { value: "swap_training", label: "Revisar/trocar treino ou plano" },
  { value: "send_feedback", label: "Enviar feedback" },
  { value: "review_evaluation", label: "Revisar avaliação" },
  { value: "review_cycle", label: "Preparar renovação" },
  { value: "free", label: "Tarefa livre" },
];

export default function RoutinesPageInner() {
  const search = useSearchParams();
  const returnTo = safeReturnTo(search.get("returnTo"));
  const [items, setItems] = useState<Routine[]>([]);
  const [name, setName] = useState("");
  const [taskType, setTaskType] = useState("swap_training");
  const [weekday, setWeekday] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const result = await apiFetch<Routine[]>("/api/v1/routines");
    if (result.error) setError(result.error.message);
    else setItems(result.data ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function create() {
    if (!name.trim()) {
      setError("Informe o nome da rotina.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await apiFetch<Routine>("/api/v1/routines", {
      method: "POST",
      body: JSON.stringify({
        name: name.trim(),
        task_type: taskType,
        recurrence: "weekly",
        weekday,
        lead_days: taskType === "review_cycle" ? 7 : 0,
      }),
    });
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setName("");
    setInfo("Rotina criada.");
    await load();
  }

  async function complete(id: string) {
    setBusy(true);
    const result = await apiFetch(`/api/v1/routines/${id}/complete`, {
      method: "POST",
      body: "{}",
    });
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setInfo("Rotina marcada como concluída.");
    await load();
  }

  return (
    <div className="space-y-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] animate-fade-up">
      <BackLink href={returnTo || "/app"} label={returnTo ? "Voltar" : "Hoje"} />
      <header className="space-y-1">
        <h1 className="h-display text-3xl text-[var(--color-ink)]">Rotinas</h1>
        <p className="text-sm text-[var(--color-ink-muted)]">
          Organize dias para revisar planos e enviar feedbacks.
        </p>
      </header>
      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
      {info ? (
        <p role="status" className="text-sm text-[var(--color-success)]">
          {info}
        </p>
      ) : null}

      <section className="space-y-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <h2 className="text-base font-semibold">Nova rotina</h2>
        <TextField label="Nome" value={name} onChange={(e) => setName(e.target.value)} />
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Tipo</span>
          <select
            className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
            value={taskType}
            onChange={(e) => setTaskType(e.target.value)}
          >
            {TASK_TYPES.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Dia da semana</span>
          <select
            className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
            value={weekday}
            onChange={(e) => setWeekday(Number(e.target.value))}
          >
            {WEEKDAYS.map((label, idx) => (
              <option key={label} value={idx}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <Button fullWidth disabled={busy} onClick={() => void create()}>
          Salvar rotina
        </Button>
      </section>

      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="space-y-2 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2"
          >
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">{item.name}</p>
              <Badge tone={item.status === "active" ? "success" : "neutral"}>
                {item.status}
              </Badge>
            </div>
            <p className="text-sm text-[var(--color-ink-muted)]">
              {TASK_TYPES.find((t) => t.value === item.task_type)?.label ?? item.task_type}
              {item.weekday != null ? ` · ${WEEKDAYS[item.weekday] ?? item.weekday}` : ""}
              {item.next_run_on ? ` · próxima: ${item.next_run_on}` : ""}
            </p>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void complete(item.id)}
            >
              Marcar concluído
            </Button>
          </li>
        ))}
      </ul>

      {returnTo ? (
        <Link href={returnTo}>
          <Button fullWidth variant="secondary">
            Voltar ao checklist
          </Button>
        </Link>
      ) : null}
    </div>
  );
}
