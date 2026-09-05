"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { AttentionItem, FinancialSummary, HomeSummary, RenewalCaseView } from "@/lib/api";
import { apiFetch, formatBRL, formatDateBR, formatOrgDateTime } from "@/lib/api";
import type { BillingEntitlement } from "@/lib/billing";
import { renewalStatusLabel } from "@/lib/renewal-status";
import { ATTENTION_PRIORITY_RANK } from "@/lib/attention-priority";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockError } from "@/components/ui/block-error";
import { ActionSheet } from "@/components/ui/action-sheet";
import {
  IconAlertCircle,
  IconBanknote,
  IconCalendarDays,
  IconClipboardList,
  IconLayers,
  IconPlus,
  IconRefreshCw,
  IconSparkles,
  IconTarget,
  IconUsersRound,
} from "@/components/ui/icons";
import { useAuth } from "@/components/auth/auth-provider";
import { ProfessionNudge } from "@/components/app/profession-nudge";
import { InitialSetupCard } from "@/components/app/initial-setup-card";
import { firstName, greetingForHour, hourInTimeZone } from "@/lib/greeting";
import {
  getInitialSetupCollapsed,
  setInitialSetupCollapsed,
  SETUP_CELEBRATE_KEY,
  subscribeInitialSetupCollapse,
} from "@/lib/setup-copy";
import { EVALUATION_SAVED_KEY } from "@/lib/evaluation-flow";
import { buildBriefing, isNewProfessional, type Briefing } from "@/lib/home-briefing";
import { PageTitle } from "@/components/ui/page-title";
import { AskAssistantLink } from "@/components/ui/ask-assistant-link";

type Props = {
  summary: HomeSummary;
};

const ASSISTANT_HOME_CONTEXT = {
  context: "Início",
  returnTo: "/app",
};

function assistantHref(prompt: string) {
  return `/app/assistant?prompt=${encodeURIComponent(prompt)}&context=${encodeURIComponent(ASSISTANT_HOME_CONTEXT.context)}&returnTo=${encodeURIComponent(ASSISTANT_HOME_CONTEXT.returnTo)}`;
}

function formatDateTimeShort(isoInstant: string, timeZone: string) {
  return formatOrgDateTime(isoInstant, timeZone, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

// ---------------------------------------------------------------------------
// Accompaniment (published-evaluation pendency) — self-contained fetch; its
// own failure never blocks the rest of the Home.
// ---------------------------------------------------------------------------

type AccompanimentRow = {
  client_id: string;
  client_name: string;
  days_since_last_evaluation: number | null;
};

function useAccompanimentPending() {
  const [rows, setRows] = useState<AccompanimentRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await apiFetch<{ items: AccompanimentRow[] }>(
        "/api/v1/accompaniment/pending?days_threshold=15",
      );
      if (cancelled) return;
      if (result.error) {
        setFailed(true);
        return;
      }
      setRows(result.data?.items ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return { rows, failed };
}

function accompanimentToAttentionItems(rows: AccompanimentRow[] | null): AttentionItem[] {
  return (rows ?? []).map((row) => ({
    kind: "evaluation_pending",
    title: `Avaliação pendente · ${row.client_name}`,
    subtitle:
      row.days_since_last_evaluation != null
        ? `${row.days_since_last_evaluation} dias sem registro`
        : "Sem registro ainda",
    href: `/app/clients/${row.client_id}?tab=prontuario`,
    entity_id: row.client_id,
    tone: "warning",
    priority_rank: ATTENTION_PRIORITY_RANK.overdueRoutineOrEvaluation,
  }));
}

// ---------------------------------------------------------------------------
// Rotinas realmente prioritárias — só as ocorrências atrasadas entram na fila
// única de prioridades (nunca a lista completa de rotinas do dia, que
// pertence à própria tela de Rotinas).
// ---------------------------------------------------------------------------

type RoutineOccurrence = {
  id: string;
  name?: string | null;
  type_label: string;
  client_name?: string | null;
  client_id?: string | null;
  overdue?: boolean;
  due_on: string;
  occurrence_type: string;
};

function useRoutinesToday() {
  const [items, setItems] = useState<RoutineOccurrence[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await apiFetch<{ groups: Array<{ items: RoutineOccurrence[] }> }>(
        "/api/v1/routines/board?bucket=today",
      );
      if (cancelled) return;
      if (result.error) {
        setFailed(true);
        return;
      }
      setItems((result.data?.groups ?? []).flatMap((g) => g.items ?? []));
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return { items, failed };
}

function priorityRoutinesToAttentionItems(items: RoutineOccurrence[] | null): AttentionItem[] {
  return (items ?? [])
    .filter((item) => item.overdue)
    .map((item) => {
      const isEvaluation = item.occurrence_type === "evaluation_review" && item.client_id;
      return {
        kind: "routine_overdue",
        title: item.name || item.type_label,
        subtitle: `${item.client_name || "Cliente"} · venceu em ${formatDateBR(item.due_on)}`,
        href: isEvaluation
          ? `/app/clients/${item.client_id}/evaluations/new?returnTo=${encodeURIComponent("/app")}&occurrenceId=${item.id}`
          : item.client_id
            ? `/app/clients/${item.client_id}`
            : "/app/routines",
        entity_id: item.id,
        tone: "danger",
        priority_rank: ATTENTION_PRIORITY_RANK.overdueRoutineOrEvaluation,
      };
    });
}

// ---------------------------------------------------------------------------
// Financeiro compacto — self-contained, reuses GET /receivables/overview.
// Never the full financial dashboard: 3 numbers + a link, nothing else.
// ---------------------------------------------------------------------------

function useFinanceOverview() {
  const [data, setData] = useState<FinancialSummary | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await apiFetch<{ summary: FinancialSummary }>("/api/v1/receivables/overview");
      if (cancelled) return;
      if (result.error) {
        setFailed(true);
        return;
      }
      setData(result.data?.summary ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return { data, failed };
}

function FinanceCompact({
  pendingPayments,
  finance,
  financeFailed,
  className = "",
}: {
  pendingPayments: HomeSummary["pending_payments"];
  finance: FinancialSummary | null;
  financeFailed: boolean;
  className?: string;
}) {
  const nextDue = [...pendingPayments].sort((a, b) => a.due_on.localeCompare(b.due_on))[0];

  return (
    <section
      aria-label="Financeiro"
      className={`space-y-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3.5 shadow-sm ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
          Financeiro
        </h2>
        <Link href="/app/receivables" className="text-sm font-medium text-[var(--color-link)] hover:underline">
          Ver central
        </Link>
      </div>
      {financeFailed ? (
        <BlockError message="Não foi possível carregar os números do mês." />
      ) : !finance ? (
        <div className="flex gap-4">
          <Skeleton className="h-10 w-20" />
          <Skeleton className="h-10 w-20" />
          <Skeleton className="h-10 w-24" />
        </div>
      ) : (
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <div>
            <p className="text-xs text-[var(--color-ink-muted)]">Recebido no mês</p>
            <p className="text-base font-semibold tabular-nums text-[var(--color-ink)]">
              {formatBRL(finance.received_month_cents)}
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-ink-muted)]">Vencido</p>
            <p
              className={`text-base font-semibold tabular-nums ${finance.overdue_cents > 0 ? "text-[var(--color-financial-overdue)]" : "text-[var(--color-ink)]"}`}
            >
              {formatBRL(finance.overdue_cents)}
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-ink-muted)]">
              {nextDue ? "Próximo a vencer" : "Sem cobrança prevista"}
            </p>
            {nextDue ? (
              <p className="text-base font-semibold tabular-nums text-[var(--color-ink)]">
                {formatBRL(nextDue.amount_cents)}
                <span className="ml-1 text-xs font-medium text-[var(--color-ink-muted)]">
                  {formatDateBR(nextDue.due_on)}
                </span>
              </p>
            ) : (
              <p className="text-base font-semibold text-[var(--color-ink-subtle)]">—</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Briefing executivo — deterministic, zero LLM calls. See lib/home-briefing.ts
// for the derivation rules and why they never re-rank the backend's own
// priority signal. The next appointment is deliberately NOT shown here — it
// lives in its own compact card at the end of the page (item 7 of the
// business-decision-center spec), so this block stays about risk/decision,
// not a restatement of the Agenda.
// ---------------------------------------------------------------------------

function ExecutiveBriefing({ briefing }: { briefing: Briefing }) {
  return (
    <section
      aria-label="Briefing do negócio"
      className="surface-briefing space-y-3 rounded-[var(--radius-lg)] px-5 py-4 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          {briefing.urgentCount > 0 ? (
            <p className="text-sm text-[var(--color-ink)]">
              <span className="font-semibold text-[var(--color-warning)]">
                {briefing.urgentCount} {briefing.urgentCount === 1 ? "item urgente" : "itens urgentes"}
              </span>{" "}
              para revisar
            </p>
          ) : null}
          {briefing.mainRisk ? (
            <p className="text-sm text-[var(--color-ink)]">
              <span className="font-medium">Principal risco:</span> {briefing.mainRisk.title}
            </p>
          ) : briefing.opportunity ? (
            <p className="text-sm text-[var(--color-ink)]">
              <span className="font-medium">Vale olhar:</span> {briefing.opportunity.title}
            </p>
          ) : (
            <p className="text-sm font-medium text-[var(--color-success)]">
              Nenhuma pendência crítica agora.
            </p>
          )}
        </div>
        {/* Desktop only — mobile already has the Cronia orb one tap away in
            the bottom nav; a second, separate "Analisar meu dia" button
            here duplicated that entry point, per the redesign. */}
        <Link href={assistantHref("Analise meu dia: ")} className="hidden shrink-0 lg:inline-block">
          <Button variant="secondary" className="hover-lift min-h-9 gap-2 px-3 text-sm">
            <span className="icon-tile icon-tile-hero -ml-1 h-6 w-6" aria-hidden>
              <IconSparkles className="h-3.5 w-3.5" />
            </span>
            Analisar meu dia
          </Button>
        </Link>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Indicadores do negócio — 4 números reais, sem inventar fonte: clientes
// ativos (GET /clients?status=active, já usado pela própria tela de
// Clientes), ciclos perto do fim (home/summary já entrega), receita prevista
// e valor vencido (GET /receivables/overview, já usado pelo Financeiro
// compacto). Nenhum endpoint novo foi criado para esta fatia.
// ---------------------------------------------------------------------------

function useActiveClientsCount() {
  const [count, setCount] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await apiFetch<Array<{ id: string }>>("/api/v1/clients?status=active");
      if (cancelled) return;
      if (result.error) {
        setFailed(true);
        return;
      }
      setCount((result.data ?? []).length);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return { count, failed };
}

function StatTile({
  label,
  value,
  tone = "neutral",
  Icon,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "danger";
  Icon: (props: { className?: string; "aria-hidden"?: boolean }) => React.ReactElement;
}) {
  return (
    <div className="hover-lift min-w-[8.5rem] flex-1 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 shadow-sm">
      <div className="flex items-center gap-1.5 text-[var(--color-ink-subtle)]">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        <p className="text-xs">{label}</p>
      </div>
      <p
        className={`mt-1 text-xl tabular-nums ${tone === "danger" ? "text-[var(--color-danger)]" : "text-[var(--color-ink)]"}`}
        style={{ fontWeight: 750, letterSpacing: "-0.02em" }}
      >
        {value}
      </p>
    </div>
  );
}

/** "Saúde da carteira" — portfolio-level signal only (active clients,
 * cycles nearing an end). The two financial numbers that used to live
 * here (receita prevista, valor vencido) moved out: FinanceCompact right
 * below already shows overdue/received/next-due, so repeating them as
 * stat tiles was the exact kind of briefing/KPI/card duplication the
 * redesign is meant to remove — this section now answers one question
 * ("is the portfolio healthy?"), not two. */
function IndicatorsRow({
  activeClients,
  activeClientsFailed,
  cyclesNearingEnd,
}: {
  activeClients: number | null;
  activeClientsFailed: boolean;
  cyclesNearingEnd: number;
}) {
  return (
    <section aria-label="Saúde da carteira" className="flex flex-wrap gap-3">
      <StatTile
        label="Clientes ativos"
        value={activeClientsFailed ? "—" : activeClients == null ? "…" : String(activeClients)}
        Icon={IconUsersRound}
      />
      <StatTile label="Ciclos perto do fim" value={String(cyclesNearingEnd)} Icon={IconRefreshCw} />
    </section>
  );
}

function IndicatorsChips({
  activeClients,
  activeClientsFailed,
  finance,
  financeFailed,
}: {
  activeClients: number | null;
  activeClientsFailed: boolean;
  finance: FinancialSummary | null;
  financeFailed: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2 text-sm" aria-label="Indicadores essenciais">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 font-medium text-[var(--color-ink)]">
        <IconUsersRound className="h-3.5 w-3.5 text-[var(--color-ink-subtle)]" aria-hidden />
        {activeClientsFailed ? "—" : activeClients == null ? "…" : activeClients} ativos
      </span>
      <span
        className={[
          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-medium",
          finance && finance.overdue_cents > 0
            ? "border-[var(--color-danger-subtle)] bg-[var(--color-danger-subtle)] text-[var(--color-danger)]"
            : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink)]",
        ].join(" ")}
      >
        <IconAlertCircle className="h-3.5 w-3.5" aria-hidden />
        {financeFailed ? "—" : finance ? formatBRL(finance.overdue_cents) : "…"} vencido
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fila única de prioridades — financeiro/ciclo/renovação/agenda (backend
// attention_items), avaliação pendente (accompaniment/pending) e SOMENTE
// rotinas atrasadas (routines/board, filtradas para overdue). Cada item
// mantém uma origem visível — nunca um item sem rótulo de onde ele vem.
// ---------------------------------------------------------------------------

function priorityIcon(kind: string) {
  if (kind === "pending_payment" || kind === "payment_report_pending") {
    return <IconBanknote className="h-4 w-4" aria-hidden />;
  }
  if (
    kind === "cycle_nearing_end" ||
    kind === "cycle_ended_unrenewed" ||
    kind === "renewal_requested" ||
    kind === "renewal_awaiting"
  ) {
    return <IconRefreshCw className="h-4 w-4" aria-hidden />;
  }
  if (kind === "appointment_needs_outcome" || kind === "appointment_awaiting_confirmation") {
    return <IconCalendarDays className="h-4 w-4" aria-hidden />;
  }
  if (kind === "routine_overdue") {
    return <IconClipboardList className="h-4 w-4" aria-hidden />;
  }
  return <IconAlertCircle className="h-4 w-4" aria-hidden />;
}

function priorityOriginLabel(kind: string) {
  if (kind === "pending_payment" || kind === "payment_report_pending") return "Financeiro";
  if (kind === "cycle_nearing_end" || kind === "cycle_ended_unrenewed") return "Ciclo";
  if (kind === "renewal_requested" || kind === "renewal_awaiting") return "Renovação";
  if (kind === "appointment_needs_outcome" || kind === "appointment_awaiting_confirmation") return "Agenda";
  if (kind === "routine_overdue") return "Rotina";
  return "Pendência";
}

function priorityToneClasses(kind: string) {
  if (kind === "routine_overdue" || kind === "pending_payment") {
    return "bg-[var(--color-danger-subtle)] text-[var(--color-danger)]";
  }
  return "bg-[var(--color-warning-subtle)] text-[var(--color-warning)]";
}

function AwaitingConfirmationSlot({ item }: { item: AttentionItem }) {
  return (
    <li>
      <div className="flex min-h-11 items-start gap-3 px-3 py-3">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-ai-subtle)] text-[var(--color-ai)]">
          {priorityIcon(item.kind)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-subtle)]">
            {priorityOriginLabel(item.kind)}
          </span>
          <span className="block font-semibold text-[var(--color-ink)]">{item.title}</span>
          <span className="block text-sm text-[var(--color-ink-muted)]">{item.subtitle}</span>
        </span>
      </div>
    </li>
  );
}

function PriorityQueue({
  items,
  failedSources,
  limit,
  title = "Precisa de decisão",
}: {
  items: AttentionItem[];
  failedSources: string[];
  limit?: number;
  /** "Outras decisões" once the briefing above has already promoted one
   * item out of this same pool — never the same case shown twice. */
  title?: string;
}) {
  const visible = limit ? items.slice(0, limit) : items;
  if (!items.length && !failedSources.length) return null;

  return (
    <section aria-label="Fila de prioridades" className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
        {title}{items.length ? ` · ${items.length}` : ""}
      </h2>
      {visible.length ? (
        <ul className="divide-y divide-[var(--color-border)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)]/80 bg-[var(--color-surface)] shadow-sm">
          {visible.map((item) => {
            if (item.kind === "appointment_awaiting_confirmation") {
              return <AwaitingConfirmationSlot key={`${item.kind}-${item.entity_id}`} item={item} />;
            }
            return (
              <li key={`${item.kind}-${item.entity_id}`}>
                <Link
                  href={item.href}
                  className="flex min-h-11 items-start gap-3 px-3.5 py-3 transition-colors hover:bg-[var(--color-surface-subtle)]"
                >
                  <span
                    className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] ${priorityToneClasses(item.kind)}`}
                  >
                    {priorityIcon(item.kind)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-subtle)]">
                      {priorityOriginLabel(item.kind)}
                    </span>
                    <span className="block font-semibold text-[var(--color-ink)]">{item.title}</span>
                    <span className="block text-sm text-[var(--color-ink-muted)]">{item.subtitle}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
      {failedSources.map((label) => (
        <BlockError key={label} message={`Não foi possível carregar: ${label}.`} />
      ))}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Renovações — só o que exige decisão: próximas, aguardando cliente,
// atrasadas e solicitações do Portal (GET /renewal-cases?scope=needs_decision,
// já filtra renovadas/encerradas). Fonte própria, não `summary.renewals` —
// esse endpoint é case-aware (aguardando cliente é um estado real agora, não
// mais o booleano contact_confirmed_at). Nunca reproduz a Central de
// Renovações inteira: só a lista compacta + link. Bloco omitido quando não
// há nenhuma pendência real — nunca uma seção vazia forçada.
// ---------------------------------------------------------------------------

function useRenewalCases() {
  const [rows, setRows] = useState<RenewalCaseView[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await apiFetch<RenewalCaseView[]>(
        "/api/v1/renewal-cases?scope=needs_decision",
      );
      if (cancelled) return;
      if (result.error) {
        setFailed(true);
        return;
      }
      setRows(result.data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return { rows, failed };
}

function RenewalsBlock() {
  const { rows, failed } = useRenewalCases();
  if (failed) {
    return (
      <section aria-label="Renovações" className="space-y-2">
        <BlockError message="Não foi possível carregar as renovações." />
      </section>
    );
  }
  if (!rows || !rows.length) return null;
  const visible = rows.slice(0, 3);
  return (
    <section
      aria-label="Renovações"
      className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3.5 shadow-sm"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
          Renovações · {rows.length}
        </h2>
        <Link href="/app/renewals" className="text-sm font-medium text-[var(--color-link)] hover:underline">
          Ver todas
        </Link>
      </div>
      <ul className="divide-y divide-[var(--color-border)]">
        {visible.map((row) => (
          <li key={row.source_cycle_id} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-1.5">
                <span className="truncate font-medium text-[var(--color-ink)]">
                  {row.client_name || "Cliente"}
                </span>
                {row.portal_requested ? <Badge tone="warning">Cliente pediu</Badge> : null}
              </p>
              <p className="truncate text-sm text-[var(--color-ink-muted)]">
                {renewalStatusLabel(row.display_status)}
                {row.display_status === "awaiting_client" && row.next_contact_date
                  ? ` · contato em ${formatDateBR(row.next_contact_date)}`
                  : ` · termina ${formatDateBR(row.ends_on)}`}
              </p>
            </div>
            <Link
              href="/app/renewals"
              className="shrink-0 text-sm font-medium text-[var(--color-link)] hover:underline"
            >
              Revisar
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Acompanhamentos recentes — reuses GET /evaluations/recent, the same
// org-wide published-evaluations feed the Acompanhamentos "Histórico" tab
// already calls. No new endpoint; just a 3-line preview + a link to the
// real screen.
// ---------------------------------------------------------------------------

type RecentEvaluationRow = {
  id: string;
  client_id: string;
  client_name?: string | null;
  title: string;
  published_at: string | null;
};

function useRecentEvaluations() {
  const [rows, setRows] = useState<RecentEvaluationRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await apiFetch<RecentEvaluationRow[]>("/api/v1/evaluations/recent?limit=5");
      if (cancelled) return;
      if (result.error) {
        setFailed(true);
        return;
      }
      setRows(result.data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return { rows, failed };
}

function RecentEvaluationsCompact({ className = "" }: { className?: string }) {
  const { rows, failed } = useRecentEvaluations();
  const visible = (rows ?? []).slice(0, 3);
  return (
    <section
      aria-label="Acompanhamentos recentes"
      className={`space-y-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3.5 shadow-sm ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
          Acompanhamentos recentes
        </h2>
        <Link
          href="/app/accompaniment"
          className="text-sm font-medium text-[var(--color-link)] hover:underline"
        >
          Ver tudo
        </Link>
      </div>
      {failed ? (
        <BlockError message="Não foi possível carregar os acompanhamentos recentes." />
      ) : !rows ? (
        <div className="space-y-2">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
        </div>
      ) : visible.length === 0 ? (
        <p className="text-sm text-[var(--color-ink-muted)]">Nenhuma avaliação publicada ainda.</p>
      ) : (
        <ul className="divide-y divide-[var(--color-border)]">
          {visible.map((row) => (
            <li key={row.id} className="py-2">
              <Link
                href={`/app/clients/${row.client_id}/evaluations/${row.id}`}
                className="flex items-center justify-between gap-3 text-sm hover:underline"
              >
                <span className="min-w-0 truncate text-[var(--color-ink)]">
                  {row.client_name || "Cliente"} · {row.title}
                </span>
                <span className="shrink-0 text-[var(--color-ink-muted)]">
                  {row.published_at ? formatDateBR(row.published_at.slice(0, 10)) : "—"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Rotinas resumidas — a one-line count (atrasadas/hoje), never the full
// Rotinas board. Reuses the same `routinesToday` fetch the priority queue
// already makes (routines/board?bucket=today); this is only a different
// presentation of data already in memory, not a second fetch.
// ---------------------------------------------------------------------------

function RoutinesSummaryCard({
  items,
  failed,
  className = "",
}: {
  items: RoutineOccurrence[] | null;
  failed: boolean;
  className?: string;
}) {
  const overdueCount = (items ?? []).filter((i) => i.overdue).length;
  const todayCount = (items ?? []).filter((i) => !i.overdue).length;
  return (
    <section
      aria-label="Rotinas"
      className={`flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3.5 shadow-sm ${className}`}
    >
      <div className="min-w-0">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
          Rotinas
        </h2>
        {failed ? (
          <p className="text-sm text-[var(--color-ink-muted)]">Não foi possível carregar.</p>
        ) : items === null ? (
          <Skeleton className="mt-1 h-5 w-32" />
        ) : overdueCount === 0 && todayCount === 0 ? (
          <p className="text-sm text-[var(--color-ink-muted)]">Nada pendente hoje.</p>
        ) : (
          <p className="text-sm text-[var(--color-ink)]">
            {overdueCount > 0 ? (
              <span className="font-semibold text-[var(--color-danger)]">{overdueCount} atrasada{overdueCount === 1 ? "" : "s"}</span>
            ) : null}
            {overdueCount > 0 && todayCount > 0 ? " · " : ""}
            {todayCount > 0 ? `${todayCount} hoje` : ""}
          </p>
        )}
      </div>
      <Link href="/app/routines" className="shrink-0 text-sm font-medium text-[var(--color-link)] hover:underline">
        Ver rotinas
      </Link>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Movimentações recentes — não existe, hoje, um feed de atividade cruzando
// domínios (clientes/ciclos/rotinas/financeiro) no backend. Em vez de
// inventar um, este bloco usa a única fonte real e honesta disponível:
// GET /receivables?status=paid (endpoint já existente), ordenado por
// paid_at. Documentado também em CRONIU_WORKSPACE_HML_PARITY.md.
// ---------------------------------------------------------------------------

type PaidReceivableRow = {
  id: string;
  client_name: string | null;
  amount_cents: number;
  paid_at: string | null;
  cycle_service_name: string | null;
};

function useRecentPayments() {
  const [rows, setRows] = useState<PaidReceivableRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await apiFetch<PaidReceivableRow[]>("/api/v1/receivables?status=paid");
      if (cancelled) return;
      if (result.error) {
        setFailed(true);
        return;
      }
      const sorted = [...(result.data ?? [])]
        .filter((r) => r.paid_at)
        .sort((a, b) => (b.paid_at as string).localeCompare(a.paid_at as string))
        .slice(0, 4);
      setRows(sorted);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return { rows, failed };
}

function RecentMovements() {
  const { rows, failed } = useRecentPayments();
  return (
    <section
      aria-label="Movimentações recentes"
      className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3.5 shadow-sm"
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
        Últimos recebimentos
      </h2>
      {failed ? (
        <BlockError message="Não foi possível carregar os últimos recebimentos." />
      ) : !rows ? (
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-[var(--color-ink-muted)]">Nenhum recebimento registrado ainda.</p>
      ) : (
        <ul className="divide-y divide-[var(--color-border)]">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="min-w-0 truncate text-[var(--color-ink)]">{r.client_name || "Cliente"}</span>
              <span className="shrink-0 tabular-nums text-[var(--color-ink-muted)]">
                {formatBRL(r.amount_cents)}
                {r.paid_at ? ` · ${formatDateBR(r.paid_at.slice(0, 10))}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Próximo compromisso — apenas contexto e acesso à Agenda. A Agenda completa
// (horários, disponibilidade, timeline do dia) já é a tela própria para isso;
// a Home nunca reproduz essa lista.
// ---------------------------------------------------------------------------

function NextAppointmentCard({
  nextAppointment,
  timeZone,
}: {
  nextAppointment: { clientName: string | null; startsAt: string; serviceLabel: string | null } | null;
  timeZone: string;
}) {
  return (
    <section
      aria-label="Próximo compromisso"
      className="flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3.5 shadow-sm"
    >
      <div className="min-w-0">
        <p className="text-xs text-[var(--color-ink-muted)]">Próximo compromisso</p>
        {nextAppointment ? (
          <p className="truncate font-medium text-[var(--color-ink)]">
            {formatDateTimeShort(nextAppointment.startsAt, timeZone)} · {nextAppointment.clientName || "Cliente"}
            {nextAppointment.serviceLabel ? ` · ${nextAppointment.serviceLabel}` : ""}
          </p>
        ) : (
          <p className="text-[var(--color-ink-muted)]">Nenhum compromisso agendado.</p>
        )}
      </div>
      <Link
        href="/app/agenda"
        className="shrink-0 text-sm font-medium text-[var(--color-link)] hover:underline"
      >
        Ver agenda
      </Link>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Ações rápidas — deliberately quiet: a slim chip row, never a grid of big
// cards competing with the operational area above it.
// ---------------------------------------------------------------------------

const QUICK_ACTIONS = [
  { label: "Novo cliente", href: "/app/clients/new", Icon: IconUsersRound },
  { label: "Novo compromisso", href: "/app/appointments/new", Icon: IconCalendarDays },
  { label: "Nova rotina", href: "/app/routines", Icon: IconLayers },
] as const;

/** Desktop keeps the full chip row (it's the complete workspace). Mobile
 * collapses the 3 creation actions into a single "+" that opens a sheet —
 * "Perguntar à Cronia" isn't in it: the orb is already one tap away in
 * the bottom nav, so repeating it here was a second entry point to the
 * same thing. */
function QuickActions() {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <>
      <nav aria-label="Ações rápidas" className="hidden flex-wrap gap-2 lg:flex">
        {QUICK_ACTIONS.map(({ label, href, Icon }) => (
          <Link
            key={href}
            href={href}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-medium text-[var(--color-ink)] transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-subtle)]"
          >
            <Icon className="h-4 w-4 text-[var(--color-primary)]" aria-hidden />
            {label}
          </Link>
        ))}
        <AskAssistantLink
          prompt=""
          context={ASSISTANT_HOME_CONTEXT.context}
          returnTo={ASSISTANT_HOME_CONTEXT.returnTo}
        >
          Perguntar à Cronia
        </AskAssistantLink>
      </nav>

      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="inline-flex min-h-11 items-center gap-1.5 self-start rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-semibold text-[var(--color-ink)] shadow-sm lg:hidden"
      >
        <IconPlus className="h-4 w-4 text-[var(--color-primary)]" aria-hidden />
        Adicionar
      </button>
      <ActionSheet open={mobileOpen} onClose={() => setMobileOpen(false)} labelledBy="home-quick-add-title">
        <h2 id="home-quick-add-title" className="text-base font-semibold text-[var(--color-ink)]">
          Adicionar
        </h2>
        <div className="mt-3 flex flex-col gap-2">
          {QUICK_ACTIONS.map(({ label, href, Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex min-h-12 items-center gap-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3.5 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-surface-subtle)]"
              onClick={() => setMobileOpen(false)}
            >
              <Icon className="h-4 w-4 text-[var(--color-primary)]" aria-hidden />
              {label}
            </Link>
          ))}
        </div>
      </ActionSheet>
    </>
  );
}

// ---------------------------------------------------------------------------
// New-professional journey — a short, elegant nudge, never the full
// onboarding wizard rebuilt here.
// ---------------------------------------------------------------------------

function NewProfessionalJourney({ name }: { name: string | null }) {
  return (
    <section
      aria-label="Comece por aqui"
      className="surface-briefing space-y-3 rounded-[var(--radius-lg)] px-5 py-5 shadow-sm"
    >
      <p className="text-sm font-semibold uppercase tracking-wide text-[var(--color-primary)]">
        Bem-vindo(a){name ? `, ${name}` : ""}
      </p>
      <h2 className="h-display text-xl text-[var(--color-ink)]">Vamos deixar tudo pronto</h2>
      <p className="text-sm text-[var(--color-ink-muted)]">
        Três passos rápidos para começar a organizar seu trabalho no Croniu.
      </p>
      <ol className="space-y-2 text-sm text-[var(--color-ink)]">
        <li className="flex items-center gap-2">
          <IconTarget className="h-4 w-4 shrink-0 text-[var(--color-primary)]" aria-hidden />
          <Link href="/app/services/new" className="font-medium text-[var(--color-link)] hover:underline">
            Cadastre seu primeiro serviço
          </Link>
        </li>
        <li className="flex items-center gap-2">
          <IconTarget className="h-4 w-4 shrink-0 text-[var(--color-primary)]" aria-hidden />
          <Link href="/app/clients/new" className="font-medium text-[var(--color-link)] hover:underline">
            Cadastre seu primeiro cliente
          </Link>
        </li>
        <li className="flex items-center gap-2">
          <IconTarget className="h-4 w-4 shrink-0 text-[var(--color-primary)]" aria-hidden />
          <Link href="/app/cycles/new" className="font-medium text-[var(--color-link)] hover:underline">
            Crie o primeiro ciclo
          </Link>
        </li>
      </ol>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Trial notice — only rendered when there is real data showing the trial is
// genuinely close to ending; never a generic upsell banner.
// ---------------------------------------------------------------------------

function useEntitlement() {
  const [data, setData] = useState<BillingEntitlement | null>(null);
  useEffect(() => {
    let cancelled = false;
    void apiFetch<BillingEntitlement>("/api/v1/billing/entitlement").then((result) => {
      if (!cancelled && result.data) setData(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return data;
}

function TrialNotice() {
  const entitlement = useEntitlement();
  if (
    !entitlement ||
    entitlement.subscription_status !== "trial" ||
    entitlement.trial_days_remaining == null ||
    entitlement.trial_days_remaining > 3
  ) {
    return null;
  }
  const days = entitlement.trial_days_remaining;
  return (
    <p className="text-sm text-[var(--color-warning)]">
      {days <= 0 ? "Seu teste grátis termina hoje." : `Seu teste grátis termina em ${days} dia${days === 1 ? "" : "s"}.`}{" "}
      <Link href="/app/settings/billing" className="font-medium underline">
        Ver plano
      </Link>
    </p>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

function subscribeSetupStorage(onStoreChange: () => void) {
  return subscribeInitialSetupCollapse(onStoreChange);
}

export function TodayBoard({ summary }: Props) {
  const { me } = useAuth();
  const [now, setNow] = useState(() => new Date());
  const setupCollapsed = useSyncExternalStore(subscribeSetupStorage, getInitialSetupCollapsed, () => false);
  const [setupCelebrate, setSetupCelebrate] = useState(false);
  const [evaluationCelebrate, setEvaluationCelebrate] = useState(false);
  const { rows: accompaniment, failed: accompanimentFailed } = useAccompanimentPending();
  const { items: routinesToday, failed: routinesFailed } = useRoutinesToday();
  const { data: finance, failed: financeFailed } = useFinanceOverview();
  const { count: activeClients, failed: activeClientsFailed } = useActiveClientsCount();

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let hideTimer = 0;
    try {
      if (sessionStorage.getItem(SETUP_CELEBRATE_KEY) !== "1") return;
      sessionStorage.removeItem(SETUP_CELEBRATE_KEY);
      hideTimer = window.setTimeout(() => {
        if (!cancelled) setSetupCelebrate(true);
        hideTimer = window.setTimeout(() => {
          if (!cancelled) setSetupCelebrate(false);
        }, 3500);
      }, 0);
    } catch {
      /* ignore */
    }
    return () => {
      cancelled = true;
      window.clearTimeout(hideTimer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let hideTimer = 0;
    try {
      if (sessionStorage.getItem(EVALUATION_SAVED_KEY) !== "1") return;
      sessionStorage.removeItem(EVALUATION_SAVED_KEY);
      hideTimer = window.setTimeout(() => {
        if (!cancelled) setEvaluationCelebrate(true);
        hideTimer = window.setTimeout(() => {
          if (!cancelled) setEvaluationCelebrate(false);
        }, 3500);
      }, 0);
    } catch {
      /* ignore */
    }
    return () => {
      cancelled = true;
      window.clearTimeout(hideTimer);
    };
  }, []);

  const hour = hourInTimeZone(now, summary.timezone);
  const greeting = greetingForHour(hour);
  const name = firstName(me?.user.full_name);
  const headline = name ? `${greeting}, ${name}` : greeting;
  const today = new Intl.DateTimeFormat("pt-BR", {
    timeZone: summary.timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now);

  const attention = summary.attention_items ?? [];
  const accompanimentItems = accompanimentToAttentionItems(accompaniment);
  const priorityRoutineItems = priorityRoutinesToAttentionItems(routinesToday);
  // Each source is fetched independently for failure isolation — a broken
  // accompaniment/routines endpoint must never take Home's own attention
  // items down with it — so the merge stays client-side. Sorting by the
  // shared `priority_rank` (backend-supplied for Home items, matched here
  // for the other two sources) keeps the queue deterministic without
  // re-deriving any business rule in the frontend.
  const combinedPriority = [...attention, ...accompanimentItems, ...priorityRoutineItems].sort(
    (a, b) => (a.priority_rank ?? 99) - (b.priority_rank ?? 99),
  );
  const failedSources = [
    accompanimentFailed ? "avaliações pendentes" : null,
    routinesFailed ? "rotinas atrasadas" : null,
  ].filter((v): v is string => Boolean(v));

  // The briefing box above shows exactly one of "Principal risco"/"Vale
  // olhar" (mainRisk wins when both exist — see the ternary below) — that
  // exact same case must never also sit in the queue below it. Computed
  // once here (not inside ExecutiveBriefing) so both the briefing text and
  // the queue filter agree on what was promoted. `opportunity` alone,
  // when mainRisk already won the slot, is never actually shown to the
  // user — it must not silently remove an unrelated queue item either.
  const briefing = buildBriefing(summary, {
    extraItems: [...accompanimentItems, ...priorityRoutineItems],
  });
  const promoted = briefing.mainRisk ?? briefing.opportunity;
  const promotedKey = promoted ? `${promoted.kind}:${promoted.entity_id}` : null;
  const queueItems = combinedPriority.filter(
    (item) => `${item.kind}:${item.entity_id}` !== promotedKey,
  );
  const queueTitle =
    queueItems.length < combinedPriority.length ? "Outras decisões" : "Precisa de decisão";

  const setupIncomplete =
    summary.has_active_service === false || summary.has_active_cycle_template === false;
  const showSetupCard = setupIncomplete && !setupCollapsed;
  const isNew = isNewProfessional(summary);

  return (
    <div className="space-y-5 animate-fade-up md:space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div>
          <PageTitle>{headline}</PageTitle>
          <p className="text-sm capitalize text-[var(--color-ink-muted)]">
            {today} · {me?.organization.name}
          </p>
        </div>
        <TrialNotice />
      </header>

      <ProfessionNudge />

      {showSetupCard ? (
        <InitialSetupCard
          compact
          professionCode={me?.organization.profession_code}
          hasService={Boolean(summary.has_active_service)}
          hasTemplate={Boolean(summary.has_active_cycle_template)}
          returnTo="/app"
          onDismissLater={() => setInitialSetupCollapsed(true)}
        />
      ) : null}

      {setupCelebrate && !setupIncomplete ? (
        <p role="status" className="text-sm text-[var(--color-ink-muted)]">
          Configuração inicial concluída
        </p>
      ) : null}
      {evaluationCelebrate ? (
        <p role="status" className="text-sm font-medium text-[var(--color-success)]">
          Avaliação registrada com sucesso
        </p>
      ) : null}

      {isNew ? (
        <NewProfessionalJourney name={name} />
      ) : (
        <>
          <ExecutiveBriefing briefing={briefing} />

          {/* Desktop: a real grid of unevenly-sized blocks, not one long
              vertical stack — the reconstruction's whole point. At most 3
              items ever surface in "Precisa de decisão"; the header count
              still shows the true total, and the full lists live on their
              own screens (Rotinas, Acompanhamentos, Ciclos e renovações).
              Mobile gets a condensed companion instead — top priority +
              essential indicators + next appointment, never these tables. */}
          <div className="hidden space-y-5 lg:block">
            <PriorityQueue items={queueItems} failedSources={failedSources} limit={3} title={queueTitle} />
            <div className="grid gap-5 xl:grid-cols-12">
              <div className="space-y-5 xl:col-span-7">
                <FinanceCompact
                  pendingPayments={summary.pending_payments}
                  finance={finance}
                  financeFailed={financeFailed}
                />
                <RecentMovements />
              </div>
              <div className="space-y-5 xl:col-span-5">
                <IndicatorsRow
                  activeClients={activeClients}
                  activeClientsFailed={activeClientsFailed}
                  cyclesNearingEnd={summary.cycles_nearing_end.length}
                />
                <RenewalsBlock />
                <RecentEvaluationsCompact />
              </div>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <RoutinesSummaryCard items={routinesToday} failed={routinesFailed} />
              <NextAppointmentCard
                nextAppointment={briefing.nextAppointment}
                timeZone={summary.timezone}
              />
            </div>
          </div>

          <div className="space-y-3 lg:hidden">
            {queueItems[0] ? (
              <Link
                href={queueItems[0].href}
                className="card-rail card-rail-warning flex min-h-11 items-start gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-3 shadow-sm"
              >
                <span
                  className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] ${priorityToneClasses(queueItems[0].kind)}`}
                >
                  {priorityIcon(queueItems[0].kind)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-subtle)]">
                    {priorityOriginLabel(queueItems[0].kind)}
                    {queueItems.length > 1 ? ` · +${queueItems.length - 1}` : ""}
                  </span>
                  <span className="block font-semibold text-[var(--color-ink)]">
                    {queueItems[0].title}
                  </span>
                  <span className="block text-sm text-[var(--color-ink-muted)]">
                    {queueItems[0].subtitle}
                  </span>
                </span>
              </Link>
            ) : (
              <p className="text-sm text-[var(--color-ink-muted)]">Nenhuma decisão pendente agora.</p>
            )}
            <IndicatorsChips
              activeClients={activeClients}
              activeClientsFailed={activeClientsFailed}
              finance={finance}
              financeFailed={financeFailed}
            />
            <NextAppointmentCard
              nextAppointment={briefing.nextAppointment}
              timeZone={summary.timezone}
            />
          </div>
        </>
      )}

      <QuickActions />
    </div>
  );
}
