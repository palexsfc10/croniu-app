"use client";

import Link from "next/link";
import { PageTitle } from "@/components/ui/page-title";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch, formatDateBR } from "@/lib/api";
import { useAuth } from "@/components/auth/auth-provider";
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
import { TableShell, Th, Tr, Td } from "@/components/ui/table-shell";
import { AskAssistantLink } from "@/components/ui/ask-assistant-link";
import { IconChevronRight, IconMoreHorizontal, IconPlus } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/empty-state";
import { BlockError } from "@/components/ui/block-error";
import { RoutineTemplatesPanel } from "@/app/app/routines/routine-templates-panel";

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
  { value: "biweekly", label: "A cada 15 dias" },
  { value: "monthly", label: "Uma vez por mês" },
  { value: "bimonthly", label: "A cada 2 meses" },
  { value: "quarterly", label: "A cada 3 meses" },
  { value: "interval", label: "Personalizado" },
  { value: "once", label: "Uma única vez" },
];

type BoardItem = {
  id: string;
  client_id: string | null;
  client_name: string | null;
  plan_title: string | null;
  occurrence_type: string;
  type_label: string;
  status: string;
  status_label: string;
  due_on: string;
  operational_date: string;
  overdue: boolean;
  source: string;
  name: string | null;
  routine_id: string | null;
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

type DeskView = "all" | "overdue" | "today" | "upcoming" | "recurring" | "completed";

const DESK_VIEWS: { value: DeskView; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "overdue", label: "Atrasadas" },
  { value: "today", label: "Hoje" },
  { value: "upcoming", label: "Próximas" },
  { value: "recurring", label: "Recorrentes" },
  { value: "completed", label: "Concluídas" },
];

function sourceLabel(source: string): string {
  if (source === "routine") return "Rotina";
  if (source === "computed") return "Automática (plano)";
  return source;
}

function matchesView(
  item: BoardItem,
  view: DeskView,
  today: string,
  recurrenceByRoutineId: Map<string, string>,
): boolean {
  if (view === "completed") return item.status === "completed";
  if (item.status === "completed") return false;
  if (view === "overdue") return item.overdue;
  if (view === "today") return !item.overdue && item.operational_date === today;
  if (view === "upcoming") return !item.overdue && item.operational_date > today;
  if (view === "recurring") {
    const rec = item.routine_id ? recurrenceByRoutineId.get(item.routine_id) : undefined;
    return Boolean(rec && rec !== "once");
  }
  return true;
}

function RoutineActions({
  item,
  busy,
  onComplete,
  onDefer,
  onCancel,
}: {
  item: BoardItem;
  busy: boolean;
  onComplete: (id: string) => void;
  onDefer: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  if (item.status === "completed") {
    return <span className="text-xs text-[var(--color-ink-subtle)]">Concluída</span>;
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {item.client_id ? (
        <Link
          href={`/app/clients/${item.client_id}`}
          className="text-sm font-medium text-[var(--color-link)]"
        >
          Abrir cliente
        </Link>
      ) : null}
      <button
        type="button"
        className="text-sm font-medium text-[var(--color-primary)] disabled:opacity-50"
        disabled={busy}
        onClick={() => onComplete(item.id)}
      >
        Concluir
      </button>
      <button
        type="button"
        className="text-sm font-medium text-[var(--color-ink-muted)] disabled:opacity-50"
        disabled={busy}
        onClick={() => onDefer(item.id)}
      >
        Adiar
      </button>
      <button
        type="button"
        className="text-sm font-medium text-[var(--color-danger)] disabled:opacity-50"
        disabled={busy}
        onClick={() => onCancel(item.id)}
      >
        Cancelar
      </button>
    </div>
  );
}

export default function RoutinesPageInner() {
  const { me } = useAuth();
  const search = useSearchParams();
  const returnTo = safeReturnTo(search.get("returnTo"));
  const clientId = search.get("clientId");
  const [items, setItems] = useState<Routine[]>([]);
  const [board, setBoard] = useState<BoardGroup[]>([]);
  const [fullBoard, setFullBoard] = useState<BoardGroup[]>([]);
  const [boardToday, setBoardToday] = useState<string>("");
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
  const [scope, setScope] = useState<"all_active" | "this_client" | "general">("general");
  const [scopeClientId, setScopeClientId] = useState("");
  const [clients, setClients] = useState<Array<{ id: string; full_name: string }>>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  // Desktop dense-list controls — independent from the mobile tree below.
  const [deskView, setDeskView] = useState<DeskView>("all");
  const [deskQuery, setDeskQuery] = useState("");
  const [deskClientId, setDeskClientId] = useState("");
  const [deskSource, setDeskSource] = useState<"" | "routine" | "computed">("");

  const boardQuery = useMemo(() => {
    const boardQs = new URLSearchParams();
    if (clientId) boardQs.set("client_id", clientId);
    return boardQs.toString();
  }, [clientId]);

  async function load() {
    const fullQs = new URLSearchParams(boardQuery);
    fullQs.set("include_completed", "true");
    fullQs.set("include_cancelled", "true");
    const [routines, paused, groups, full, allClients] = await Promise.all([
      apiFetch<Routine[]>("/api/v1/routines"),
      apiFetch<Routine[]>("/api/v1/routines?status=paused"),
      apiFetch<{ groups: BoardGroup[] }>(
        `/api/v1/routines/board${boardQuery ? `?${boardQuery}` : ""}`,
      ),
      apiFetch<{ today: string; groups: BoardGroup[] }>(`/api/v1/routines/board?${fullQs}`),
      apiFetch<Array<{ id: string; full_name: string }>>("/api/v1/clients"),
    ]);
    const active = routines.error ? [] : (routines.data ?? []);
    const pausedRows = paused.error ? [] : (paused.data ?? []);
    if (routines.error) setError(routines.error.message);
    else setItems([...active, ...pausedRows]);
    if (groups.error) setError(groups.error.message);
    else if (groups.data) setBoard(groups.data.groups ?? []);
    if (full.data) {
      setFullBoard(full.data.groups ?? []);
      setBoardToday(full.data.today ?? "");
    }
    if (allClients.data) setClients(allClients.data);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- remote hydrate
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed remount plus clientId filter
  }, [boardQuery]);

  function filterJson() {
    return {
      trigger_type: "calendar",
      audience: scope,
      client_id: scope === "this_client" ? scopeClientId || null : null,
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
    if (scope === "this_client" && !scopeClientId) {
      setError("Selecione o aluno desta rotina.");
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
    setCustomOpen(false);
    await load();
  }

  async function setRoutineStatus(id: string, status: "paused" | "active" | "archived") {
    setBusy(true);
    setMenuFor(null);
    const result = await apiFetch(`/api/v1/routines/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    await load();
  }

  async function decide(id: string, status: "completed" | "deferred" | "cancelled") {
    setBusy(true);
    setError(null);
    const body: { status: string; deferred_until?: string } = { status };
    if (status === "deferred") {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      body.deferred_until = d.toISOString().slice(0, 10);
    }
    const result = await apiFetch(`/api/v1/routines/occurrences/${id}/decide`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setInfo(
      status === "completed"
        ? "Ocorrência concluída."
        : status === "cancelled"
          ? "Ocorrência cancelada."
          : "Ocorrência adiada para amanhã.",
    );
    await load();
  }

  const yours = items.filter((r) => r.status === "active" || r.status === "paused");
  const pendingCount = board.reduce((sum, g) => sum + (g.occurrence_count ?? g.count), 0);
  const freqText = (item: Routine) =>
    FREQUENCIES.find((f) => f.value === item.recurrence)?.label || item.recurrence;
  const scopeText = (item: Routine) => {
    const audience = (item.filter_json as { audience?: string } | null)?.audience;
    if (audience === "all_active") return "Todos os alunos elegíveis";
    if (audience === "selected") return "Alunos selecionados";
    if (audience === "this_client") return "Um aluno específico";
    return null;
  };

  const recurrenceByRoutineId = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of items) map.set(r.id, r.recurrence);
    return map;
  }, [items]);

  const allDeskItems = useMemo(
    () => fullBoard.flatMap((g) => g.items),
    [fullBoard],
  );

  const overdueTodayCount = useMemo(
    () => allDeskItems.filter((i) => i.overdue).length,
    [allDeskItems],
  );

  const filteredDeskItems = useMemo(() => {
    const q = deskQuery.trim().toLowerCase();
    return allDeskItems
      .filter((i) => matchesView(i, deskView, boardToday, recurrenceByRoutineId))
      .filter((i) => (deskClientId ? i.client_id === deskClientId : true))
      .filter((i) => (deskSource ? i.source === deskSource : true))
      .filter((i) => {
        if (!q) return true;
        const hay = `${i.name || ""} ${i.client_name || ""} ${i.type_label}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => (a.overdue === b.overdue ? a.due_on.localeCompare(b.due_on) : a.overdue ? -1 : 1));
  }, [allDeskItems, deskView, deskClientId, deskSource, deskQuery, boardToday, recurrenceByRoutineId]);

  const todayCount = allDeskItems.filter(
    (i) => !i.overdue && i.status !== "completed" && i.operational_date === boardToday,
  ).length;
  const nextItem = [...allDeskItems]
    .filter((i) => i.status === "open" && !i.overdue)
    .sort((a, b) => a.due_on.localeCompare(b.due_on))[0];

  const createDialog = customOpen ? (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="custom-routine-title"
    >
      <div className="max-h-[min(36rem,calc(100dvh-7rem))] w-full max-w-md space-y-3 overflow-y-auto rounded-[var(--radius-lg)] bg-[var(--color-surface)] p-4 shadow-lg">
        <h2 id="custom-routine-title" className="text-base font-semibold">
          Nova rotina
        </h2>
        <TextField label="Nome" value={name} onChange={(e) => setName(e.target.value)} />
        <SuggestionChips chips={ROUTINE_NAME_SUGGESTIONS} onSelect={setName} />
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Tipo</span>
          <select
            aria-label="Tipo"
            className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
            value={taskType}
            onChange={(e) => setTaskType(e.target.value)}
          >
            {routineTypes(
              resolveCapabilities(me?.organization.profession_code, me?.organization.use_cases).includes(
                "workouts",
              ),
            ).map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Para quem é esta rotina?</span>
          <select
            aria-label="Para quem é esta rotina?"
            className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
            value={scope}
            onChange={(e) => setScope(e.target.value as typeof scope)}
          >
            <option value="all_active">Para todos os alunos elegíveis</option>
            <option value="this_client">Para um aluno específico</option>
            <option value="general">Rotina geral, sem aluno</option>
          </select>
        </label>
        <ConditionalField when={scope === "this_client"}>
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Aluno</span>
            <select
              aria-label="Aluno"
              className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
              value={scopeClientId}
              onChange={(e) => setScopeClientId(e.target.value)}
            >
              <option value="">Selecione…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </select>
          </label>
        </ConditionalField>
        <label className="block space-y-1.5 text-sm" htmlFor="routine-frequency">
          <span className="font-medium">Com que frequência?</span>
          <select
            id="routine-frequency"
            data-testid="routine-frequency"
            aria-label="Com que frequência?"
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
              aria-label="Dia da semana"
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
              aria-label="Como no mês?"
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
                aria-label="Qual ocorrência"
                className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
                value={nth}
                onChange={(e) => setNth(Number(e.target.value))}
              >
                <option value={1}>Primeira</option>
                <option value={2}>Segunda</option>
                <option value={3}>Terceira</option>
                <option value={4}>Quarta</option>
                <option value={5}>Quinta</option>
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
                aria-label="Unidade"
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
        <Button fullWidth variant="ghost" onClick={() => setCustomOpen(false)}>
          Cancelar
        </Button>
      </div>
    </div>
  ) : null;

  function openCreateDialog() {
    setCustomOpen(true);
    if (!clients.length) {
      void apiFetch<Array<{ id: string; full_name: string }>>("/api/v1/clients").then((result) =>
        setClients(result.data ?? []),
      );
    }
  }

  return (
    <div className="animate-fade-up">
      <BackLink href={returnTo || "/app"} label={returnTo ? "Voltar" : "Início"} />

      {/* Desktop: dense work-management central. */}
      <div className="hidden space-y-4 lg:block">
        <div className="flex items-start justify-between gap-3">
          <div>
            <PageTitle>Rotinas</PageTitle>
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
              Trabalho a realizar — distinto da Agenda (compromissos com data e horário).
            </p>
          </div>
          <Button onClick={openCreateDialog}>
            <IconPlus className="mr-1.5 h-4 w-4" aria-hidden />
            Nova rotina
          </Button>
        </div>

        {error ? <BlockError message={error} /> : null}
        {info ? (
          <p role="status" className="text-sm text-[var(--color-success)]">
            {info}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Agrupamento">
          {DESK_VIEWS.map((v) => (
            <button
              key={v.value}
              type="button"
              role="tab"
              aria-selected={deskView === v.value}
              className={`min-h-9 rounded-full px-3 text-sm font-semibold ${
                deskView === v.value
                  ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                  : "border border-[var(--color-border)] text-[var(--color-ink-muted)]"
              }`}
              onClick={() => setDeskView(v.value)}
            >
              {v.label}
              {v.value === "overdue" && overdueTodayCount > 0 ? ` · ${overdueTodayCount}` : ""}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            aria-label="Buscar rotina"
            placeholder="Buscar por título, cliente ou tipo…"
            value={deskQuery}
            onChange={(e) => setDeskQuery(e.target.value)}
            className="min-h-10 min-w-[16rem] flex-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm"
          />
          <select
            aria-label="Filtrar por cliente"
            value={deskClientId}
            onChange={(e) => setDeskClientId(e.target.value)}
            className="min-h-10 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm"
          >
            <option value="">Todos os clientes</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
              </option>
            ))}
          </select>
          <select
            aria-label="Filtrar por origem"
            value={deskSource}
            onChange={(e) => setDeskSource(e.target.value as typeof deskSource)}
            className="min-h-10 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm"
          >
            <option value="">Toda origem</option>
            <option value="routine">Rotina</option>
            <option value="computed">Automática (plano)</option>
          </select>
        </div>

        {filteredDeskItems.length === 0 ? (
          <EmptyState
            title="Nada aqui"
            description={
              deskView === "completed"
                ? "Nenhuma rotina concluída neste período."
                : "Sem pendências para os filtros atuais."
            }
            action={
              <Button variant="secondary" onClick={openCreateDialog}>
                Nova rotina
              </Button>
            }
          />
        ) : (
          <TableShell>
          <table className="w-full text-sm">
            <thead>
              <Tr>
                <Th>Rotina</Th>
                <Th>Cliente</Th>
                <Th>Tipo</Th>
                <Th>Origem</Th>
                <Th>Vencimento</Th>
                <Th>Status</Th>
                <Th>Ações</Th>
              </Tr>
            </thead>
            <tbody>
              {filteredDeskItems.map((item) => (
                <Tr key={item.id} className="align-top hover:bg-[var(--color-surface-subtle)]">
                  <Td className="font-medium text-[var(--color-ink)]">
                    {item.name || item.type_label}
                  </Td>
                  <Td className="text-[var(--color-ink-muted)]">{item.client_name || "—"}</Td>
                  <Td className="text-[var(--color-ink-muted)]">{item.type_label}</Td>
                  <Td className="text-[var(--color-ink-muted)]">{sourceLabel(item.source)}</Td>
                  <Td className="tabular-nums">
                    <span className={item.overdue ? "font-semibold text-[var(--color-danger)]" : ""}>
                      {formatDateBR(item.due_on)}
                      {item.overdue ? " · Atrasada" : ""}
                    </span>
                  </Td>
                  <Td>
                    <Badge
                      tone={
                        item.status === "completed"
                          ? "success"
                          : item.status === "cancelled"
                            ? "neutral"
                            : item.overdue
                              ? "danger"
                              : "info"
                      }
                    >
                      {item.status_label}
                    </Badge>
                  </Td>
                  <Td>
                    <RoutineActions
                      item={item}
                      busy={busy}
                      onComplete={(id) => void decide(id, "completed")}
                      onDefer={(id) => void decide(id, "deferred")}
                      onCancel={(id) => void decide(id, "cancelled")}
                    />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </table>
          </TableShell>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <section aria-label="Suas rotinas" className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
              Suas rotinas (definições)
            </h2>
            {!yours.length ? (
              <p className="text-sm text-[var(--color-ink-muted)]">
                Nenhuma rotina ativa. Crie uma acima ou ative uma sugestão.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {yours.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{item.name}</p>
                      <p className="text-xs text-[var(--color-ink-muted)]">
                        {freqText(item)}
                        {scopeText(item) ? ` · ${scopeText(item)}` : ""}
                      </p>
                    </div>
                    <Badge tone={item.status === "active" ? "success" : "neutral"}>
                      {item.status === "active" ? "Ativa" : "Pausada"}
                    </Badge>
                    {item.status === "active" ? (
                      <button
                        type="button"
                        className="shrink-0 text-xs font-medium text-[var(--color-ink-muted)]"
                        onClick={() => void setRoutineStatus(item.id, "paused")}
                      >
                        Pausar
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="shrink-0 text-xs font-medium text-[var(--color-primary)]"
                        onClick={() => void setRoutineStatus(item.id, "active")}
                      >
                        Reativar
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <RoutineTemplatesPanel enabled={items.filter((r) => r.status === "active")} onChanged={load} />
        </div>
      </div>

      {/* Mobile: operational summary — never the dense desktop table/filters. */}
      <div className="space-y-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:hidden">
        <header className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <PageTitle>Rotinas</PageTitle>
            <AskAssistantLink prompt="Sobre minhas rotinas: " context="Rotinas" returnTo="/app/routines">
              Perguntar à IA
            </AskAssistantLink>
          </div>
          <p className="text-sm text-[var(--color-ink-muted)]">
            {clientId
              ? "Pendências deste cliente. Cada marco permanece visível até ser concluído."
              : "Organize os dias em que você revisa planos, acompanha clientes e prepara renovações."}
          </p>
        </header>
        {error ? <BlockError message={error} /> : null}
        {info ? (
          <p role="status" className="text-sm text-[var(--color-success)]">
            {info}
          </p>
        ) : null}

        {overdueTodayCount > 0 || todayCount > 0 || nextItem ? (
          <section aria-label="Resumo" className="grid grid-cols-2 gap-2">
            <div className="rounded-[var(--radius-lg)] border border-[var(--color-danger)]/30 bg-[var(--color-danger-subtle)] px-3 py-2.5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-danger)]">
                Atrasadas
              </p>
              <p className="text-lg font-semibold tabular-nums text-[var(--color-ink)]">{overdueTodayCount}</p>
            </div>
            <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
                Hoje
              </p>
              <p className="text-lg font-semibold tabular-nums text-[var(--color-ink)]">{todayCount}</p>
            </div>
          </section>
        ) : null}
        {nextItem ? (
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-primary)]/30 bg-[var(--color-primary-subtle)] px-3.5 py-3 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-primary)]">
              Próxima rotina
            </p>
            <p className="font-semibold text-[var(--color-ink)]">
              {nextItem.name || nextItem.type_label}
              {nextItem.client_name ? ` · ${nextItem.client_name}` : ""}
            </p>
            <p className="text-sm text-[var(--color-ink-muted)]">até {formatDateBR(nextItem.due_on)}</p>
          </div>
        ) : null}

        <section className="space-y-3" aria-label="Suas rotinas">
          {!yours.length ? (
            <>
              <h2 className="text-lg font-semibold">Suas rotinas</h2>
              <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] px-3 py-4">
                <p className="font-medium">Você ainda não ativou nenhuma rotina.</p>
                <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                  Ative uma sugestão abaixo para o Croniu lembrar você.
                </p>
              </div>
            </>
          ) : (
            <details open className="group">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-2 text-lg font-semibold">
                  Suas rotinas
                  <span className="rounded-full bg-[var(--color-surface-subtle)] px-2 py-0.5 text-xs font-medium text-[var(--color-ink-muted)]">
                    {yours.length}
                  </span>
                </span>
                <IconChevronRight className="h-4 w-4 shrink-0 text-[var(--color-ink-muted)] transition-transform group-open:rotate-90" />
              </summary>
              <ul className="mt-3 space-y-2">
                {yours.map((item) => (
                  <li
                    key={item.id}
                    className="relative space-y-2 rounded-[var(--radius-md)] border border-[var(--color-primary)]/30 bg-[var(--color-primary-subtle)]/40 px-3 py-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">{item.name}</p>
                          <Badge tone={item.status === "active" ? "success" : "neutral"}>
                            {item.status === "active" ? "Ativa" : "Pausada"}
                          </Badge>
                        </div>
                        <p className="text-sm text-[var(--color-ink-muted)]">
                          {freqText(item)}
                          {item.next_run_on ? ` · próxima: ${formatDateBR(item.next_run_on)}` : ""}
                        </p>
                        {scopeText(item) ? (
                          <p className="text-xs text-[var(--color-ink-muted)]">{scopeText(item)}</p>
                        ) : null}
                      </div>
                      <div className="relative">
                        <Button
                          variant="ghost"
                          className="min-h-11 min-w-11 px-2"
                          aria-label={`Opções de ${item.name}`}
                          onClick={() => setMenuFor((cur) => (cur === item.id ? null : item.id))}
                        >
                          <IconMoreHorizontal className="h-5 w-5" />
                        </Button>
                        {menuFor === item.id ? (
                          <div className="absolute right-0 z-10 mt-1 min-w-40 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-sm">
                            {item.status === "active" ? (
                              <button
                                type="button"
                                className="block w-full px-3 py-2 text-left text-sm"
                                onClick={() => void setRoutineStatus(item.id, "paused")}
                              >
                                Pausar
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="block w-full px-3 py-2 text-left text-sm"
                                onClick={() => void setRoutineStatus(item.id, "active")}
                              >
                                Reativar
                              </button>
                            )}
                            <button
                              type="button"
                              className="block w-full px-3 py-2 text-left text-sm text-[var(--color-danger)]"
                              onClick={() => {
                                if (
                                  !window.confirm(
                                    "Arquivar toda a rotina? As próximas ocorrências deixam de ser geradas.",
                                  )
                                )
                                  return;
                                void setRoutineStatus(item.id, "archived");
                              }}
                            >
                              Desativar
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>

        <RoutineTemplatesPanel enabled={items.filter((r) => r.status === "active")} onChanged={load} />

        <Link
          href={`/app/routines/pending${clientId ? `?clientId=${clientId}` : ""}`}
          className="flex min-h-11 items-center justify-between rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3 text-sm font-medium"
        >
          <span>Ver pendências</span>
          {pendingCount > 0 ? (
            <span className="rounded-full bg-[var(--color-primary-subtle)] px-2 py-0.5 text-xs font-semibold text-[var(--color-primary)]">
              {pendingCount}
            </span>
          ) : (
            <span className="text-xs text-[var(--color-ink-muted)]">Tudo em dia</span>
          )}
        </Link>

        <button
          type="button"
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] px-3 py-3 text-sm text-[var(--color-ink-muted)]"
          onClick={openCreateDialog}
        >
          <IconPlus className="h-5 w-5" />
          Criar rotina personalizada
        </button>

        {returnTo ? (
          <Link href={returnTo}>
            <Button fullWidth variant="secondary">
              Voltar ao checklist
            </Button>
          </Link>
        ) : null}
      </div>

      {createDialog}
    </div>
  );
}
