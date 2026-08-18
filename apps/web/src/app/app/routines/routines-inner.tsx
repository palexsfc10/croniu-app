"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch, formatDateBR, type ProfessionProfile } from "@/lib/api";
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
import { IconChevronRight, IconMoreHorizontal, IconPlus } from "@/components/ui/icons";
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

type BoardGroup = {
  occurrence_type: string;
  count: number;
  occurrence_count?: number;
};

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
  const [scope, setScope] = useState<"all_active" | "this_client" | "general">("general");
  const [scopeClientId, setScopeClientId] = useState("");
  const [clients, setClients] = useState<Array<{ id: string; full_name: string }>>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [profession, setProfession] = useState<ProfessionProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const boardQuery = useMemo(() => {
    const boardQs = new URLSearchParams();
    if (clientId) boardQs.set("client_id", clientId);
    return boardQs.toString();
  }, [clientId]);

  async function load() {
    const [routines, paused, groups, prof] = await Promise.all([
      apiFetch<Routine[]>("/api/v1/routines"),
      apiFetch<Routine[]>("/api/v1/routines?status=paused"),
      apiFetch<{ groups: BoardGroup[] }>(
        `/api/v1/routines/board${boardQuery ? `?${boardQuery}` : ""}`,
      ),
      apiFetch<ProfessionProfile>("/api/v1/organization/profession"),
    ]);
    const active = routines.error ? [] : (routines.data ?? []);
    const pausedRows = paused.error ? [] : (paused.data ?? []);
    if (routines.error) setError(routines.error.message);
    else setItems([...active, ...pausedRows]);
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

      <RoutineTemplatesPanel
        enabled={items.filter((r) => r.status === "active")}
        onChanged={load}
      />

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
        onClick={() => {
          setCustomOpen(true);
          if (!clients.length) {
            void apiFetch<Array<{ id: string; full_name: string }>>("/api/v1/clients").then(
              (result) => setClients(result.data ?? []),
            );
          }
        }}
      >
        <IconPlus className="h-5 w-5" />
        Criar rotina personalizada
      </button>

      {customOpen ? (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="custom-routine-title"
        >
          <div className="max-h-[min(36rem,calc(100dvh-7rem))] w-full max-w-md space-y-3 overflow-y-auto rounded-[var(--radius-lg)] bg-[var(--color-surface)] p-4 shadow-lg">
        <h2 id="custom-routine-title" className="text-base font-semibold">Nova rotina</h2>
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
      ) : null}

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
