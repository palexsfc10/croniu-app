"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch, type ProfessionProfile } from "@/lib/api";
import { ROUTINE_NAME_SUGGESTIONS, routineTypes } from "@/lib/form-guidance";
import { resolveCapabilities } from "@/lib/capabilities";
import { SuggestionChips } from "@/components/ui/suggestion-chips";
import { ConditionalField } from "@/components/ui/conditional-field";
import { FieldHint } from "@/components/ui/field-hint";
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
  filter_json?: Record<string, unknown> | null;
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

const FREQUENCIES = [
  { value: "weekly", label: "Toda semana" },
  { value: "biweekly", label: "A cada 2 semanas" },
  { value: "monthly", label: "Uma vez por mês" },
  { value: "bimonthly", label: "A cada 2 meses" },
  { value: "quarterly", label: "A cada 3 meses" },
  { value: "interval", label: "Intervalo personalizado" },
  { value: "once", label: "Uma única vez" },
];

type BoardItem = {
  id: string;
  client_id: string | null;
  client_name: string | null;
  plan_title: string | null;
  due_on: string;
  overdue: boolean;
  type_label: string;
};

type BoardGroup = {
  occurrence_type: string;
  label: string;
  count: number;
  occurrence_count?: number;
  client_count?: number;
  overdue_count: number;
  items: BoardItem[];
};

function groupByClient(items: BoardItem[]) {
  const map = new Map<string, BoardItem[]>();
  for (const item of items) {
    const key = item.client_id || item.id;
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }
  return [...map.values()].map((list) => {
    const sorted = [...list].sort((a, b) => a.due_on.localeCompare(b.due_on));
    return { next: sorted[0], rest: sorted.slice(1) };
  });
}

export default function RoutinesPageInner() {
  const search = useSearchParams();
  const returnTo = safeReturnTo(search.get("returnTo"));
  const clientId = search.get("clientId");
  const [items, setItems] = useState<Routine[]>([]);
  const [board, setBoard] = useState<BoardGroup[]>([]);
  const [name, setName] = useState("");
  const [taskType, setTaskType] = useState("review_protocol");
  const [weekday, setWeekday] = useState(1);
  const [recurrence, setRecurrence] = useState("weekly");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [noEnd, setNoEnd] = useState(true);
  const [monthMode, setMonthMode] = useState<"dom" | "nth_weekday">("dom");
  const [monthDay, setMonthDay] = useState(10);
  const [nth, setNth] = useState(1);
  const [intervalN, setIntervalN] = useState(2);
  const [intervalUnit, setIntervalUnit] = useState("weeks");
  const [preview, setPreview] = useState<string | null>(null);
  const [profession, setProfession] = useState<ProfessionProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const boardQuery = useMemo(() => {
    const boardQs = new URLSearchParams();
    if (clientId) boardQs.set("client_id", clientId);
    return boardQs.toString();
  }, [clientId]);

  async function load() {
    const [routines, groups, prof] = await Promise.all([
      apiFetch<Routine[]>("/api/v1/routines"),
      apiFetch<{ groups: BoardGroup[] }>(
        `/api/v1/routines/board${boardQuery ? `?${boardQuery}` : ""}`,
      ),
      apiFetch<ProfessionProfile>("/api/v1/organization/profession"),
    ]);
    if (routines.error) setError(routines.error.message);
    else setItems(routines.data ?? []);
    if (groups.error) setError(groups.error.message);
    else if (groups.data) setBoard(groups.data.groups ?? []);
    if (prof.data) setProfession(prof.data);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- remote hydrate
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed remount plus clientId filter
  }, [boardQuery]);

  function filterJson() {
    return {
      weekdays: [weekday],
      starts_on: startsOn || null,
      ends_on: noEnd ? null : endsOn || null,
      no_end: noEnd,
      month_mode: monthMode,
      month_day: monthDay,
      nth,
      nth_weekday: weekday,
      interval_n: intervalN,
      interval_unit: intervalUnit,
    };
  }

  async function refreshPreview() {
    const result = await apiFetch<{ preview: string }>("/api/v1/routines/preview", {
      method: "POST",
      body: JSON.stringify({
        name: name.trim() || "Rotina",
        task_type: taskType,
        recurrence,
        weekday,
        filter_json: filterJson(),
      }),
    });
    if (result.data?.preview) setPreview(result.data.preview);
  }

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
        recurrence,
        weekday,
        lead_days: taskType === "review_cycle" || taskType === "prepare_renewal" ? 7 : 0,
        filter_json: filterJson(),
        next_run_on: recurrence === "once" && startsOn ? startsOn : null,
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

  async function completeOccurrence(id: string) {
    setBusy(true);
    const result = await apiFetch(`/api/v1/routines/occurrences/${id}/decide`, {
      method: "POST",
      body: JSON.stringify({ status: "completed" }),
    });
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setInfo("Ocorrência marcada como realizada.");
    await load();
  }

  return (
    <div className="space-y-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] animate-fade-up">
      <BackLink href={returnTo || "/app"} label={returnTo ? "Voltar" : "Hoje"} />
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Rotinas</h1>
        <p className="text-sm text-[var(--color-ink-muted)]">
          {clientId
            ? "Pendências deste cliente. Cada marco permanece visível até ser concluído."
            : "Organize os dias em que você revisa planos, acompanha clientes e prepara renovações."}
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

      {board.length ? (
        <section className="space-y-2" aria-label="Pendências">
          {board.map((group) => {
            const occ = group.occurrence_count ?? group.count;
            const clients = group.client_count ?? new Set(group.items.map((i) => i.client_id)).size;
            return (
              <details
                key={group.occurrence_type}
                className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2"
              >
                <summary className="cursor-pointer min-h-11">
                  <span className="font-semibold">{group.label}</span>
                  <span className="ml-2 text-sm text-[var(--color-ink-muted)]">
                    {occ} ocorrência{occ === 1 ? "" : "s"} · {clients} cliente
                    {clients === 1 ? "" : "s"}
                    {group.overdue_count ? ` · ${group.overdue_count} atrasado(s)` : ""}
                  </span>
                </summary>
                <ul className="mt-2 space-y-3">
                  {groupByClient(group.items).map(({ next, rest }) => (
                    <li key={next.id} className="text-sm">
                      <OccurrenceRow item={next} busy={busy} onComplete={completeOccurrence} />
                      {rest.length ? (
                        <details className="mt-1">
                          <summary className="flex min-h-11 cursor-pointer items-center text-sm text-[var(--color-ink-muted)]">
                            Ver {rest.length} ocorrência{rest.length === 1 ? "" : "s"} seguinte
                            {rest.length === 1 ? "" : "s"}
                          </summary>
                          <ul className="mt-2 space-y-2 pl-2">
                            {rest.map((item) => (
                              <li key={item.id}>
                                <OccurrenceRow
                                  item={item}
                                  busy={busy}
                                  onComplete={completeOccurrence}
                                />
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </details>
            );
          })}
        </section>
      ) : null}

      <section className="space-y-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <h2 className="text-base font-semibold">Nova rotina</h2>
        <TextField label="Nome" value={name} onChange={(e) => setName(e.target.value)} />
        <SuggestionChips chips={ROUTINE_NAME_SUGGESTIONS} onSelect={setName} />
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Tipo</span>
          <select
            className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
            value={taskType}
            onChange={(e) => setTaskType(e.target.value)}
          >
            {routineTypes(resolveCapabilities(profession?.profession_code, profession?.use_cases).includes("workouts")).map(
              (opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ),
            )}
          </select>
        </label>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Com que frequência?</span>
          <select
            className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
            value={recurrence}
            onChange={(e) => {
              setRecurrence(e.target.value);
              void refreshPreview();
            }}
          >
            {FREQUENCIES.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <ConditionalField when={recurrence !== "interval"}>
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
        </ConditionalField>
        <ConditionalField when={recurrence === "monthly"}>
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Como no mês?</span>
            <select
              className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
              value={monthMode}
              onChange={(e) => setMonthMode(e.target.value as "dom" | "nth_weekday")}
            >
              <option value="dom">Dia fixo do mês</option>
              <option value="nth_weekday">Posição do dia da semana</option>
            </select>
          </label>
          {monthMode === "dom" ? (
            <TextField
              label="Dia do mês"
              type="number"
              value={String(monthDay)}
              onChange={(e) => setMonthDay(Number(e.target.value))}
            />
          ) : (
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">Qual ocorrência</span>
              <select
                className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
                value={nth}
                onChange={(e) => setNth(Number(e.target.value))}
              >
                <option value={1}>Primeira</option>
                <option value={2}>Segunda</option>
                <option value={3}>Terceira</option>
                <option value={4}>Quarta</option>
                <option value={-1}>Última</option>
              </select>
            </label>
          )}
        </ConditionalField>
        <ConditionalField when={recurrence === "interval"}>
          <div className="grid grid-cols-2 gap-2">
            <TextField
              label="A cada"
              type="number"
              value={String(intervalN)}
              onChange={(e) => setIntervalN(Number(e.target.value))}
            />
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">Unidade</span>
              <select
                className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
                value={intervalUnit}
                onChange={(e) => setIntervalUnit(e.target.value)}
              >
                <option value="days">dias</option>
                <option value="weeks">semanas</option>
                <option value="months">meses</option>
              </select>
            </label>
          </div>
        </ConditionalField>
        <TextField
          label="Data de início"
          type="date"
          value={startsOn}
          onChange={(e) => setStartsOn(e.target.value)}
        />
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={noEnd} onChange={(e) => setNoEnd(e.target.checked)} />
          Sem data final
        </label>
        <ConditionalField when={!noEnd}>
          <TextField
            label="Data de término"
            type="date"
            value={endsOn}
            onChange={(e) => setEndsOn(e.target.value)}
          />
        </ConditionalField>
        <Button type="button" variant="secondary" onClick={() => void refreshPreview()}>
          Ver próxima ocorrência
        </Button>
        {preview ? <FieldHint>{preview}</FieldHint> : null}
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
                {item.status === "active" ? "Ativa" : "Pausada"}
              </Badge>
            </div>
            <p className="text-sm text-[var(--color-ink-muted)]">
              {item.recurrence}
              {item.next_run_on ? ` · próxima: ${item.next_run_on}` : ""}
            </p>
            <div className="flex flex-col gap-2">
              <Button variant="secondary" disabled={busy} onClick={() => void complete(item.id)}>
                Concluir esta ocorrência
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm("Arquivar toda a rotina? As próximas ocorrências deixam de ser geradas.")) return;
                  void apiFetch(`/api/v1/routines/${item.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({ status: "archived" }),
                  }).then(() => load());
                }}
              >
                Encerrar toda a rotina
              </Button>
            </div>
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

function OccurrenceRow({
  item,
  busy,
  onComplete,
}: {
  item: BoardItem;
  busy: boolean;
  onComplete: (id: string) => void;
}) {
  return (
    <div>
      <span className="font-medium">{item.client_name || "Cliente"}</span>
      {item.plan_title ? ` · ${item.plan_title}` : ""}
      {" · "}até {item.due_on}
      {item.overdue ? " · atrasado" : ""}
      <div className="mt-1">
        <Button variant="secondary" disabled={busy} onClick={() => onComplete(item.id)}>
          Marcar realizado
        </Button>
      </div>
    </div>
  );
}
