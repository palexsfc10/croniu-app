"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { Appointment, AttentionItem, HomeSummary, Receivable } from "@/lib/api";
import { apiFetch, formatBRL, formatDateBR, formatOrgDateTime } from "@/lib/api";
import type { BillingEntitlement } from "@/lib/billing";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockError } from "@/components/ui/block-error";
import {
  IconAlertCircle,
  IconBanknote,
  IconCalendarDays,
  IconChevronRight,
  IconClipboardList,
  IconLayers,
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
import { buildBriefing, isNewProfessional } from "@/lib/home-briefing";

type Props = {
  summary: HomeSummary;
};

const UPCOMING_LIMIT = 5;
const ASSISTANT_HOME_CONTEXT = {
  context: "Início",
  returnTo: "/app",
};

function assistantHref(prompt: string) {
  return `/app/assistant?prompt=${encodeURIComponent(prompt)}&context=${encodeURIComponent(ASSISTANT_HOME_CONTEXT.context)}&returnTo=${encodeURIComponent(ASSISTANT_HOME_CONTEXT.returnTo)}`;
}

function formatTimeOnly(isoInstant: string, timeZone: string) {
  return formatOrgDateTime(isoInstant, timeZone, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

function appointmentTime(item: Appointment, timeZone: string) {
  return formatTimeOnly(item.starts_at, timeZone);
}

// ---------------------------------------------------------------------------
// Accompaniment (published-evaluation pendency) — self-contained fetch, same
// isolation pattern as TodayActions below: its own failure never blocks the
// rest of the Home.
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

// ---------------------------------------------------------------------------
// Financeiro compacto — self-contained, reuses GET /receivables/overview.
// Never the full financial dashboard: 3 numbers + a link, nothing else.
// ---------------------------------------------------------------------------

type FinanceOverviewSummary = {
  received_month_cents: number;
  overdue_cents: number;
  overdue_count: number;
};

function useFinanceOverview() {
  const [data, setData] = useState<FinanceOverviewSummary | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await apiFetch<{ summary: FinanceOverviewSummary }>(
        "/api/v1/receivables/overview",
      );
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
  className = "",
}: {
  pendingPayments: Receivable[];
  className?: string;
}) {
  const { data, failed } = useFinanceOverview();
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
      {failed ? (
        <BlockError message="Não foi possível carregar os números do mês." />
      ) : !data ? (
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
              {formatBRL(data.received_month_cents)}
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-ink-muted)]">Vencido</p>
            <p
              className={`text-base font-semibold tabular-nums ${data.overdue_cents > 0 ? "text-[var(--color-danger)]" : "text-[var(--color-ink)]"}`}
            >
              {formatBRL(data.overdue_cents)}
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
// Briefing do dia — deterministic, zero LLM calls. See lib/home-briefing.ts
// for the derivation rules and why they never re-rank the backend's own
// priority signal.
// ---------------------------------------------------------------------------

function DailyBriefing({
  summary,
  accompanimentCount,
  timeZone,
}: {
  summary: HomeSummary;
  accompanimentCount: number | null;
  timeZone: string;
}) {
  const briefing = buildBriefing(summary, {
    accompanimentPendingCount: accompanimentCount ?? 0,
  });

  return (
    <section
      aria-label="Briefing do dia"
      className="surface-briefing space-y-3 rounded-[var(--radius-lg)] px-5 py-4 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          {briefing.nextAppointment ? (
            <p className="text-sm text-[var(--color-ink-muted)]">
              Próximo compromisso ·{" "}
              <span className="font-semibold text-[var(--color-ink)]">
                {formatTimeOnly(briefing.nextAppointment.startsAt, timeZone)}
              </span>{" "}
              com {briefing.nextAppointment.clientName || "cliente"}
            </p>
          ) : (
            <p className="text-sm text-[var(--color-ink-muted)]">Nenhum compromisso agendado hoje.</p>
          )}
          {briefing.urgentCount > 0 ? (
            <p className="text-sm text-[var(--color-ink)]">
              <span className="font-semibold text-[var(--color-warning)]">
                {briefing.urgentCount} {briefing.urgentCount === 1 ? "item urgente" : "itens urgentes"}
              </span>{" "}
              hoje
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
          ) : briefing.isClearDay ? (
            <p className="text-sm font-medium text-[var(--color-success)]">Dia livre de pendências.</p>
          ) : null}
        </div>
        <Link href={assistantHref("Analise meu dia: ")} className="shrink-0">
          <Button variant="secondary" className="min-h-9 px-3 text-sm">
            <IconSparkles className="mr-1.5 h-4 w-4" aria-hidden />
            Analisar meu dia
          </Button>
        </Link>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Agenda do dia (timeline) — unchanged visual language, already the least
// "generic card" element on the old Home per the visual audit.
// ---------------------------------------------------------------------------

function TimelineRow({
  item,
  timeZone,
  phase,
}: {
  item: Appointment;
  timeZone: string;
  phase: "in_progress" | "upcoming";
}) {
  const detail = [item.service_name || item.cycle_service_name, item.location_name]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="relative flex gap-3">
      <div className="flex w-12 shrink-0 flex-col items-end pt-3">
        <time className="text-sm font-semibold tabular-nums text-[var(--color-ink)]">
          {appointmentTime(item, timeZone)}
        </time>
      </div>
      <div className="relative flex flex-col items-center">
        <span
          className={[
            "mt-3.5 h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-[var(--color-surface)]",
            phase === "in_progress" ? "bg-[var(--color-progress)]" : "bg-[var(--color-border-strong)]",
          ].join(" ")}
          aria-hidden
        />
        <span className="w-px flex-1 bg-[var(--color-border)]" aria-hidden />
      </div>
      <Link
        href={`/app/appointments/${item.id}`}
        className="min-h-11 min-w-0 flex-1 rounded-[var(--radius-sm)] py-2.5 pr-1 transition-colors hover:bg-[var(--color-surface-subtle)]/80"
      >
        <p className="font-semibold text-[var(--color-ink)]">{item.client_name}</p>
        <p className="text-sm text-[var(--color-ink-muted)]">{detail || "Compromisso"}</p>
        {phase === "in_progress" ? (
          <span className="mt-1 inline-block text-[11px] font-semibold uppercase tracking-wide text-[var(--color-progress)]">
            Em andamento
          </span>
        ) : null}
      </Link>
    </li>
  );
}

function DayTimeline({
  inProgress,
  upcoming,
  timeZone,
}: {
  inProgress: Appointment[];
  upcoming: Appointment[];
  timeZone: string;
}) {
  const future = upcoming.slice(0, UPCOMING_LIMIT);
  const hasMore = upcoming.length > UPCOMING_LIMIT;
  const empty = inProgress.length === 0 && future.length === 0;

  return (
    <section aria-label="Agenda de hoje" className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
          Agenda de hoje
        </h2>
        <Link href="/app/agenda" className="text-sm font-medium text-[var(--color-link)] hover:underline">
          Completa
        </Link>
      </div>

      {empty ? (
        <p className="text-sm text-[var(--color-ink-muted)]">
          Nenhum compromisso futuro hoje. Sua agenda está livre pelo restante do dia.
        </p>
      ) : (
        <ul className="space-y-0">
          {inProgress.map((item) => (
            <TimelineRow key={item.id} item={item} timeZone={timeZone} phase="in_progress" />
          ))}
          {future.map((item) => (
            <TimelineRow key={item.id} item={item} timeZone={timeZone} phase="upcoming" />
          ))}
        </ul>
      )}

      {hasMore ? (
        <Link href="/app/agenda" className="text-sm font-medium text-[var(--color-link)]">
          Ver mais na agenda
        </Link>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Fila única de atenção — merges financeiro/renovação/agenda (attention_items,
// real backend tones) with avaliação pendente (accompaniment/pending, its own
// isolated fetch) and rotinas de hoje (routines/board, its own isolated
// fetch). Every row keeps a visible origin label — never a bare unlabeled
// item — per "cada item deve indicar claramente sua origem".
// ---------------------------------------------------------------------------

function attentionIcon(kind: string) {
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
  return <IconAlertCircle className="h-4 w-4" aria-hidden />;
}

function attentionOriginLabel(kind: string) {
  if (kind === "pending_payment" || kind === "payment_report_pending") return "Financeiro";
  if (kind === "cycle_nearing_end" || kind === "cycle_ended_unrenewed") return "Ciclo";
  if (kind === "renewal_requested" || kind === "renewal_awaiting") return "Renovação";
  if (kind === "appointment_needs_outcome" || kind === "appointment_awaiting_confirmation") return "Agenda";
  return "Pendência";
}

function AwaitingConfirmationSlot({ item }: { item: AttentionItem }) {
  return (
    <li>
      <div className="flex min-h-11 items-start gap-3 px-3 py-3">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-ai-subtle)] text-[var(--color-ai)]">
          {attentionIcon(item.kind)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-subtle)]">
            {attentionOriginLabel(item.kind)}
          </span>
          <span className="block font-semibold text-[var(--color-ink)]">{item.title}</span>
          <span className="block text-sm text-[var(--color-ink-muted)]">{item.subtitle}</span>
        </span>
      </div>
    </li>
  );
}

function AttentionQueue({
  items,
  accompaniment,
  accompanimentFailed,
  limit,
}: {
  items: AttentionItem[];
  accompaniment: AccompanimentRow[] | null;
  accompanimentFailed: boolean;
  limit?: number;
}) {
  const accompanimentItems: AttentionItem[] = (accompaniment ?? []).map((row) => ({
    kind: "evaluation_pending",
    title: `Avaliação pendente · ${row.client_name}`,
    subtitle:
      row.days_since_last_evaluation != null
        ? `${row.days_since_last_evaluation} dias sem registro`
        : "Sem registro ainda",
    href: `/app/clients/${row.client_id}?tab=prontuario`,
    entity_id: row.client_id,
    tone: "warning",
  }));
  const combined = [...items, ...accompanimentItems];
  const visible = limit ? combined.slice(0, limit) : combined;

  if (!visible.length && !accompanimentFailed) return null;

  return (
    <section aria-label="Precisa de atenção" className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
        Precisa de atenção{combined.length ? ` · ${combined.length}` : ""}
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
                  <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-warning-subtle)] text-[var(--color-warning)]">
                    {attentionIcon(item.kind)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-subtle)]">
                      {attentionOriginLabel(item.kind)}
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
      {accompanimentFailed ? (
        <BlockError message="Não foi possível carregar avaliações pendentes." />
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Rotinas de hoje — same data source as before (routines/board?bucket=today),
// own isolated fetch, restyled to sit inside the operational area instead of
// a same-weight generic card.
// ---------------------------------------------------------------------------

type TodayActionItem = {
  id: string;
  name?: string | null;
  type_label: string;
  client_name?: string | null;
  client_id?: string | null;
  overdue?: boolean;
  due_on: string;
  occurrence_type: string;
};

const TODAY_ACTIONS_LIMIT = 3;

function groupByOccurrenceType(items: TodayActionItem[]) {
  const map = new Map<string, TodayActionItem[]>();
  for (const item of items) {
    const list = map.get(item.occurrence_type) ?? [];
    list.push(item);
    map.set(item.occurrence_type, list);
  }
  return [...map.values()];
}

function RestSummaryRow({ items }: { items: TodayActionItem[] }) {
  const label = items[0]?.name || items[0]?.type_label || "Ações";
  const anyOverdue = items.some((i) => i.overdue);
  const names = items
    .map((i) => i.client_name)
    .filter((n): n is string => Boolean(n))
    .slice(0, 2);
  const extra = items.length - names.length;
  const who =
    names.length > 0
      ? `${names.join(", ")}${extra > 0 ? ` e mais ${extra}` : ""}`
      : `${items.length} pendência${items.length === 1 ? "" : "s"}`;
  return (
    <li className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3 py-3">
      <p className="flex flex-wrap items-center gap-1.5 font-semibold">
        {items.length} {label.toLowerCase()}
        {anyOverdue ? <Badge tone="danger">Atrasadas</Badge> : null}
      </p>
      <p className="text-sm text-[var(--color-ink-muted)]">{who}</p>
      <Link href="/app/routines" className="mt-1 inline-block text-sm font-medium text-[var(--color-link)]">
        Ver pendências
      </Link>
    </li>
  );
}

function EvaluationActionCard({ item }: { item: TodayActionItem }) {
  const dueLabel = item.overdue
    ? `venceu em ${formatDateBR(item.due_on)}`
    : `vence hoje · ${formatDateBR(item.due_on)}`;
  const href = `/app/clients/${item.client_id}/evaluations/new?returnTo=${encodeURIComponent("/app")}&occurrenceId=${item.id}`;

  return (
    <Link
      href={href}
      className={[
        "card-rail flex min-h-11 items-start gap-3 rounded-[var(--radius-lg)] border bg-[var(--color-surface)] px-4 py-3.5 shadow-sm transition-shadow hover:shadow-md",
        item.overdue ? "card-rail-danger border-[var(--color-border)]" : "card-rail-warning border-[var(--color-border)]",
      ].join(" ")}
    >
      <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-primary-subtle)] text-[var(--color-primary)]">
        <IconClipboardList className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold text-[var(--color-ink)]">
            {item.name || "Realizar avaliação"}
          </span>
          <Badge tone={item.overdue ? "danger" : "warning"} className="uppercase tracking-wide">
            {item.overdue ? "Atrasada" : "Hoje"}
          </Badge>
        </span>
        <span className="mt-0.5 block text-sm text-[var(--color-ink-muted)]">
          {item.client_name || "Cliente"} · {dueLabel}
        </span>
        <span className="mt-1.5 inline-flex items-center gap-1 text-sm font-medium text-[var(--color-link)]">
          Registrar avaliação
          <IconChevronRight className="h-3.5 w-3.5" aria-hidden />
        </span>
      </span>
    </Link>
  );
}

function useRoutinesToday() {
  const [items, setItems] = useState<TodayActionItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await apiFetch<{ groups: Array<{ items: TodayActionItem[] }> }>(
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

function TodayActions({ items, failed }: { items: TodayActionItem[] | null; failed: boolean }) {
  if (failed) return <BlockError message="Não foi possível carregar as rotinas de hoje." />;
  if (!items || !items.length) return null;

  const sorted = [...items].sort((a, b) => {
    if (Boolean(b.overdue) !== Boolean(a.overdue)) return b.overdue ? 1 : -1;
    return a.due_on.localeCompare(b.due_on);
  });
  const individual = sorted.slice(0, TODAY_ACTIONS_LIMIT);
  const rest = sorted.slice(TODAY_ACTIONS_LIMIT);
  const restGroups = groupByOccurrenceType(rest);

  return (
    <section aria-label="Suas rotinas de hoje" className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
        Rotinas de hoje
      </h2>
      <ul className="space-y-2">
        {individual.map((item) => {
          if (item.occurrence_type === "evaluation_review" && item.client_id) {
            return (
              <li key={item.id}>
                <EvaluationActionCard item={item} />
              </li>
            );
          }
          return (
            <li
              key={item.id}
              className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3.5 shadow-sm"
            >
              <Badge tone={item.overdue ? "danger" : "neutral"} className="mb-1 uppercase tracking-wide">
                {item.overdue ? "Atrasada" : "Hoje"}
              </Badge>
              <p className="font-semibold">{item.name || item.type_label}</p>
              <p className="text-sm text-[var(--color-ink-muted)]">
                {item.client_name || "Clientes elegíveis"} · até {formatDateBR(item.due_on)}
              </p>
              <Link
                href={item.client_id ? `/app/clients/${item.client_id}` : "/app/routines"}
                className="mt-1 inline-block text-sm font-medium text-[var(--color-link)]"
              >
                {item.client_id ? "Abrir cliente" : "Ver rotinas"}
              </Link>
            </li>
          );
        })}
        {restGroups.map((group) => (
          <RestSummaryRow key={group[0].occurrence_type} items={group} />
        ))}
      </ul>
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

function QuickActions() {
  return (
    <nav aria-label="Ações rápidas" className="flex flex-wrap gap-2">
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
      <Link
        href={assistantHref("")}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-[var(--color-ai-border)] bg-[var(--color-ai-subtle)] px-3 py-1.5 text-sm font-medium text-[var(--color-ai-hover)] transition-colors hover:bg-[var(--color-ai-subtle)]/70"
      >
        <IconSparkles className="h-4 w-4" aria-hidden />
        Perguntar à IA
      </Link>
    </nav>
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

  const upcoming =
    summary.upcoming_appointments ??
    summary.today_appointments.filter((a) => new Date(a.starts_at).getTime() > now.getTime());
  const inProgress =
    summary.in_progress_appointments ??
    summary.today_appointments.filter((a) => {
      const start = new Date(a.starts_at).getTime();
      const end = new Date(a.ends_at).getTime();
      const t = now.getTime();
      return start <= t && t < end;
    });

  const attention = summary.attention_items ?? [];
  const setupIncomplete =
    summary.has_active_service === false || summary.has_active_cycle_template === false;
  const showSetupCard = setupIncomplete && !setupCollapsed;
  const isNew = isNewProfessional(summary);

  return (
    <div className="space-y-5 animate-fade-up md:space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div>
          <h1 className="h-display text-[1.5rem] text-[var(--color-ink)] md:text-[1.875rem]">
            {headline}
          </h1>
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
        <DailyBriefing
          summary={summary}
          accompanimentCount={accompaniment ? accompaniment.length : null}
          timeZone={summary.timezone}
        />
      )}

      {!isNew ? (
        (() => {
          const combinedAttentionCount = attention.length + (accompaniment?.length ?? 0);
          const clear =
            combinedAttentionCount === 0 &&
            upcoming.length === 0 &&
            inProgress.length === 0 &&
            (!routinesToday || routinesToday.length === 0) &&
            !setupIncomplete;
          if (clear) {
            return (
              <>
                <EmptyState
                  tone="success"
                  title="Tudo organizado"
                  description="Você não possui nenhuma pendência para revisar agora."
                  action={
                    <Link href="/app/agenda">
                      <Button variant="secondary" className="min-h-10 px-3 text-sm">
                        Abrir Agenda
                      </Button>
                    </Link>
                  }
                />
                <FinanceCompact pendingPayments={summary.pending_payments} />
              </>
            );
          }
          const topAttention: AttentionItem | null =
            attention[0] ??
            (accompaniment?.[0]
              ? {
                  kind: "evaluation_pending",
                  title: `Avaliação pendente · ${accompaniment[0].client_name}`,
                  subtitle:
                    accompaniment[0].days_since_last_evaluation != null
                      ? `${accompaniment[0].days_since_last_evaluation} dias sem registro`
                      : "Sem registro ainda",
                  href: `/app/clients/${accompaniment[0].client_id}?tab=prontuario`,
                  entity_id: accompaniment[0].client_id,
                  tone: "warning",
                }
              : null);
          return (
            <>
              {/* Desktop: full operational grid + compact finance. Never
                  shown on mobile — this is exactly the "coluna única" the
                  fatia forbids for small screens. */}
              <div className="hidden space-y-5 lg:block">
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-start lg:gap-8">
                  <div className="space-y-5 md:space-y-6">
                    <DayTimeline inProgress={inProgress} upcoming={upcoming} timeZone={summary.timezone} />
                    <TodayActions items={routinesToday} failed={routinesFailed} />
                  </div>
                  <AttentionQueue
                    items={attention}
                    accompaniment={accompaniment}
                    accompanimentFailed={accompanimentFailed}
                  />
                </div>
                <FinanceCompact pendingPayments={summary.pending_payments} />
              </div>

              {/* Mobile: operational companion, not a compressed desktop —
                  next compromisso already lives in the briefing above; here
                  we add only the single most important pending item and
                  quick links into the full screens, per the fatia's mobile
                  list (items 2–4 and 6). */}
              <div className="space-y-3 lg:hidden">
                {topAttention ? (
                  <Link
                    href={topAttention.href}
                    className="card-rail card-rail-warning flex min-h-11 items-start gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-3 shadow-sm"
                  >
                    <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-warning-subtle)] text-[var(--color-warning)]">
                      {attentionIcon(topAttention.kind)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-subtle)]">
                        {attentionOriginLabel(topAttention.kind)}
                        {combinedAttentionCount > 1 ? ` · +${combinedAttentionCount - 1}` : ""}
                      </span>
                      <span className="block font-semibold text-[var(--color-ink)]">
                        {topAttention.title}
                      </span>
                      <span className="block text-sm text-[var(--color-ink-muted)]">
                        {topAttention.subtitle}
                      </span>
                    </span>
                  </Link>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Link
                    href="/app/agenda"
                    className="inline-flex min-h-9 items-center rounded-full border border-[var(--color-border)] px-3 text-sm font-medium text-[var(--color-ink-muted)]"
                  >
                    Ver agenda
                  </Link>
                  <Link
                    href="/app/receivables"
                    className="inline-flex min-h-9 items-center rounded-full border border-[var(--color-border)] px-3 text-sm font-medium text-[var(--color-ink-muted)]"
                  >
                    Ver financeiro
                  </Link>
                  <Link
                    href="/app/routines"
                    className="inline-flex min-h-9 items-center rounded-full border border-[var(--color-border)] px-3 text-sm font-medium text-[var(--color-ink-muted)]"
                  >
                    Ver rotinas
                  </Link>
                </div>
              </div>
            </>
          );
        })()
      ) : null}

      <QuickActions />
    </div>
  );
}
