"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { Appointment, AttentionItem, HomeSummary, PriorityAction } from "@/lib/api";
import { apiFetch, formatOrgDateTime } from "@/lib/api";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import {
  IconAlertCircle,
  IconBanknote,
  IconCalendarDays,
  IconRefreshCw,
} from "@/components/ui/icons";
import { useAuth } from "@/components/auth/auth-provider";
import { ProfessionNudge } from "@/components/app/profession-nudge";
import { InitialSetupCard } from "@/components/app/initial-setup-card";
import {
  firstName,
  greetingForHour,
  hourInTimeZone,
} from "@/lib/greeting";
import {
  getInitialSetupCollapsed,
  setInitialSetupCollapsed,
  SETUP_CELEBRATE_KEY,
  subscribeInitialSetupCollapse,
} from "@/lib/setup-copy";

type Props = {
  summary: HomeSummary;
};

const UPCOMING_LIMIT = 5;

function priorityCta(action: PriorityAction) {
  return action.cta_label || "Abrir";
}

function PriorityCard({ action }: { action: PriorityAction }) {
  return (
    <section
      aria-label="Ação prioritária"
      className="rounded-[var(--radius-md)] border border-[var(--color-primary)]/25 bg-[var(--color-primary-subtle)]/30 px-3.5 py-3"
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-primary)]">
        Prioridade
      </p>
      <h2 className="mt-0.5 text-base font-semibold text-[var(--color-ink)]">{action.title}</h2>
      <p className="mt-0.5 text-sm text-[var(--color-ink-muted)]">{action.subtitle}</p>
      <Link href={action.href} className="mt-2.5 inline-block">
        <Button className="min-h-10 px-3 text-sm">{priorityCta(action)}</Button>
      </Link>
    </section>
  );
}

function CalmPriorityLine({ message }: { message: string }) {
  return (
    <p
      aria-label="Sem prioridade operacional"
      className="text-sm text-[var(--color-ink-muted)]"
    >
      <span className="font-medium text-[var(--color-success)]">Tudo em dia</span>
      {" · "}
      {message}
    </p>
  );
}

function appointmentTime(item: Appointment, timeZone: string) {
  return formatOrgDateTime(item.starts_at, timeZone, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

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
            phase === "in_progress"
              ? "bg-[var(--color-progress)]"
              : "bg-[var(--color-border-strong)]",
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
        <Link
          href="/app/agenda"
          className="text-sm font-medium text-[var(--color-link)] hover:underline"
        >
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

/** Visual slot for future AI confirmation — never fed with mocks in this release. */
function AwaitingConfirmationSlot({ item }: { item: AttentionItem }) {
  return (
    <li>
      <div className="flex min-h-11 items-start gap-3 px-3 py-3">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-ai-subtle)] text-[var(--color-ai)]">
          {attentionIcon(item.kind)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-[var(--color-ink)]">{item.title}</span>
          <span className="block text-sm text-[var(--color-ink-muted)]">{item.subtitle}</span>
          <span className="mt-2 flex flex-wrap gap-2 opacity-40" aria-hidden>
            <span className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2 py-1 text-xs">
              Realizada
            </span>
            <span className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2 py-1 text-xs">
              Cancelada
            </span>
            <span className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2 py-1 text-xs">
              Remarcar
            </span>
          </span>
        </span>
      </div>
    </li>
  );
}

function AttentionSection({ items }: { items: AttentionItem[] }) {
  if (!items.length) {
    return null;
  }

  return (
    <section aria-label="Precisa de atenção" className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
        Precisa de atenção · {items.length}
      </h2>
      <ul className="divide-y divide-[var(--color-border)] overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)]/80 bg-[var(--color-surface)]">
        {items.map((item) => {
          if (item.kind === "appointment_awaiting_confirmation") {
            return <AwaitingConfirmationSlot key={`${item.kind}-${item.entity_id}`} item={item} />;
          }
          return (
            <li key={`${item.kind}-${item.entity_id}`}>
              <Link
                href={item.href}
                className="flex min-h-11 items-start gap-3 px-3 py-2.5 transition-colors hover:bg-[var(--color-surface-subtle)]"
              >
                <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-warning-subtle)] text-[var(--color-warning)]">
                  {attentionIcon(item.kind)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-[var(--color-ink)]">{item.title}</span>
                  <span className="block text-sm text-[var(--color-ink-muted)]">{item.subtitle}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function subscribeSetupStorage(onStoreChange: () => void) {
  return subscribeInitialSetupCollapse(onStoreChange);
}

function TodayActions() {
  const [items, setItems] = useState<
    Array<{
      id: string;
      name?: string | null;
      type_label: string;
      client_name?: string | null;
      client_id?: string | null;
      overdue?: boolean;
      due_on: string;
      occurrence_type: string;
    }>
  >([]);
  useEffect(() => {
    void (async () => {
      const result = await apiFetch<{
        groups: Array<{ items: typeof items }>;
      }>("/api/v1/routines/board?bucket=today");
      const flat = (result.data?.groups ?? []).flatMap((g) => g.items ?? []);
      setItems(flat);
    })();
  }, []);
  if (!items.length) return null;
  return (
    <section aria-label="Suas ações de hoje" className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
        Suas ações de hoje
      </h2>
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-accent)]">
              {item.overdue ? "Atrasada" : "Hoje"}
            </p>
            <p className="font-semibold">{item.name || item.type_label}</p>
            <p className="text-sm text-[var(--color-ink-muted)]">
              {item.client_name || "Grupo de clientes"} · prazo {item.due_on}
            </p>
            <Link
              href={item.client_id ? `/app/clients/${item.client_id}` : "/app/routines"}
              className="mt-1 inline-block text-sm font-medium text-[var(--color-link)]"
            >
              {item.client_id ? "Abrir cliente" : "Ver rotinas"}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function TodayBoard({ summary }: Props) {
  const { me } = useAuth();
  const [now, setNow] = useState(() => new Date());
  const setupCollapsed = useSyncExternalStore(
    subscribeSetupStorage,
    getInitialSetupCollapsed,
    () => false,
  );
  const [setupCelebrate, setSetupCelebrate] = useState(false);

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

  const hour = hourInTimeZone(now, summary.timezone);
  const greeting = greetingForHour(hour);
  const name = firstName(me?.user.full_name);
  const headline = name ? `${greeting}, ${name}` : greeting;

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

  const attentionBase = summary.attention_items ?? [];
  const extraAttention: AttentionItem[] = [];
  if (
    (summary.protocol_reviews_due_count ?? 0) > 0 &&
    !attentionBase.some((i) => i.kind === "plan_review" || i.href === "/app/routines")
  ) {
    extraAttention.push({
      kind: "plan_review_group",
      title: "Revisão de planos",
      subtitle: `${summary.protocol_reviews_due_count} para revisar`,
      href: "/app/routines",
      entity_id: "routines-review",
    });
  }
  if ((summary.feedbacks_due_count ?? 0) > 0) {
    extraAttention.push({
      kind: "feedback_group",
      title: "Feedbacks",
      subtitle: `${summary.feedbacks_due_count} para acompanhar`,
      href: "/app/routines",
      entity_id: "routines-feedback",
    });
  }
  const attention = [...attentionBase, ...extraAttention];
  const hasIntakeCounts =
    (summary.new_submissions_count ?? 0) > 0 ||
    (summary.evaluation_pending_count ?? 0) > 0 ||
    (summary.protocol_pending_count ?? 0) > 0 ||
    (summary.routines_due_today_count ?? 0) > 0 ||
    (summary.protocol_reviews_due_count ?? 0) > 0 ||
    (summary.feedbacks_due_count ?? 0) > 0 ||
    (summary.plans_ending_count ?? 0) > 0;
  const hasAttention = attention.length > 0 || hasIntakeCounts;
  const priority = summary.priority_action;
  const hasAgenda = upcoming.length > 0 || inProgress.length > 0;
  const setupIncomplete =
    summary.has_active_service === false || summary.has_active_cycle_template === false;
  const showSetupCard = setupIncomplete && !setupCollapsed;
  const fullyClear = !priority && !hasAttention && !hasAgenda && !setupIncomplete;
  const showCalmLine = !priority && hasAgenda && !hasAttention && !setupIncomplete;

  return (
    <div className="space-y-4 animate-fade-up md:space-y-5">
      <header className="space-y-1">
        <h1 className="h-display text-3xl text-[var(--color-ink)] md:text-[2rem]">{headline}</h1>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="text-sm text-[var(--color-ink-muted)]">
            {summary.message || "Veja o que precisa da sua atenção hoje."}
          </p>
          <Link
            href="/app/assistant"
            className="text-sm font-medium text-[var(--color-ink-muted)] underline-offset-2 hover:text-[var(--color-ink)] hover:underline"
          >
            Assistente
          </Link>
        </div>
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

      {fullyClear ? (
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
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-start lg:gap-8">
          <div className="space-y-4">
            {priority ? (
              <PriorityCard action={priority} />
            ) : hasAttention ? (
              <p className="text-sm text-[var(--color-ink-muted)]">
                Revise o que precisa da sua atenção.
              </p>
            ) : showCalmLine ? (
              <CalmPriorityLine
                message={
                  summary.message || "Nenhuma pendência operacional no momento."
                }
              />
            ) : setupIncomplete && !hasAgenda ? (
              <p className="text-sm text-[var(--color-ink-muted)]">
                Sua rotina ainda está sendo configurada.
              </p>
            ) : null}
            <TodayActions />
            <DayTimeline
              inProgress={inProgress}
              upcoming={upcoming}
              timeZone={summary.timezone}
            />
          </div>
          <AttentionSection items={attention} />
        </div>
      )}
    </div>
  );
}
