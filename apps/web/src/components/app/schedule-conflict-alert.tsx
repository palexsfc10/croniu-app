"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export type ScheduleConflictItem = {
  id?: string | null;
  client_name?: string | null;
  starts_at: string;
  ends_at?: string | null;
  occurrence?: string;
};

function formatWhen(iso: string, timeZone: string) {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(dt);
}

export function isScheduleConflictCode(code: string | undefined) {
  return code === "SCHEDULE_CONFLICT" || code === "appointment_conflict";
}

type Props = {
  conflicts: ScheduleConflictItem[];
  conflictCount?: number;
  timeZone: string;
  onAdjust: () => void;
};

export function ScheduleConflictAlert({
  conflicts,
  conflictCount,
  timeZone,
  onAdjust,
}: Props) {
  const [open, setOpen] = useState(false);
  const count = conflictCount ?? conflicts.length;
  const preview = conflicts.slice(0, 3);

  return (
    <div
      role="alert"
      className="space-y-2 rounded-[var(--radius-md)] border border-[var(--color-danger)]/25 bg-[var(--color-danger-subtle)] px-3 py-3"
    >
      <p className="text-sm font-semibold text-[var(--color-danger)]">
        Encontramos conflitos na agenda
      </p>
      <p className="text-sm text-[var(--color-ink)]">
        Alguns horários já possuem compromissos. Ajuste a programação antes de criar o ciclo.
      </p>
      <p className="text-sm font-medium text-[var(--color-ink)]">
        {count} {count === 1 ? "aula em conflito" : "aulas em conflito"}
      </p>
      <ul className="space-y-1 text-sm text-[var(--color-ink)]">
        {(open ? conflicts : preview).map((c) => (
          <li key={`${c.id ?? "x"}-${c.starts_at}`}>
            {c.occurrence || formatWhen(c.starts_at, timeZone)}
          </li>
        ))}
      </ul>
      {conflicts.length > 3 ? (
        <button
          type="button"
          className="text-sm font-semibold text-[var(--color-primary)] underline-offset-2 hover:underline"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Recolher" : "Ver conflitos"}
        </button>
      ) : null}
      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="button" variant="secondary" onClick={onAdjust}>
          Ajustar dias e horários
        </Button>
      </div>
    </div>
  );
}
