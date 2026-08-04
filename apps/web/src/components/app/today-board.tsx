"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Appointment, AttentionItem, HomeSummary, PriorityAction } from "@/lib/api";
import { formatOrgDateTime } from "@/lib/api";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import {
  IconAlertCircle,
  IconBanknote,
  IconCalendarDays,
  IconRefreshCw,
} from "@/components/ui/icons";
import { useAuth } from "@/components/auth/auth-provider";
import {
  firstName,
  greetingForHour,
  hourInTimeZone,
} from "@/lib/greeting";

type Props = {
  summary: HomeSummary;
};

const UPCOMING_LIMIT = 4;

function priorityCta(action: PriorityAction) {
  return action.cta_label || "Abrir";
}

function PriorityCard({ action }: { action: PriorityAction }) {
  return (
    <section
      aria-label="Ação prioritária"
      className="rounded-[var(--radius-lg)] border border-[var(--color-primary)]/20 bg-[var(--color-primary-subtle)]/35 p-4 shadow-[var(--shadow-sm)]"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-primary)]">
        Ação prioritária
      </p>
      <h2 className="mt-1 text-lg font-semibold text-[var(--color-ink)]">{action.title}</h2>
      <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{action.subtitle}</p>
      <Link href={action.href} className="mt-3 inline-block">
        <Button>{priorityCta(action)}</Button>
      </Link>
    </section>
  );
}

function OrganizedCard({ message }: { message: string }) {
  return (
    <section
      aria-label="Dia organizado"
      className="rounded-[var(--radius-lg)] border border-[var(--color-success)]/25 bg-[var(--color-success-subtle)]/40 p-4"
    >
      <h2 className="text-lg font-semibold text-[var(--color-ink)]">Seu dia está organizado</h2>
      <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{message}</p>
    </section>
  );
}

function appointmentTime(item: Appointment, timeZone: string) {
  return formatOrgDateTime(item.starts_at, timeZone, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

function UpcomingAppointments({
  items,
  timeZone,
  priorityEntityId,
}: {
  items: Appointment[];
  timeZone: string;
  priorityEntityId?: string | null;
}) {
  const visible = items.slice(0, UPCOMING_LIMIT);
  const hasMore = items.length > UPCOMING_LIMIT;

  if (!visible.length) {
    return (
      <section aria-label="Próximos compromissos" className="space-y-2">
        <h2 className="text-base font-semibold text-[var(--color-ink)]">Próximos compromissos</h2>
        <p className="text-sm text-[var(--color-ink-muted)]">
          Nenhum outro compromisso hoje. Sua agenda está livre pelo restante do dia.
        </p>
        <Link href="/app/agenda" className="text-sm font-semibold text-[var(--color-link)]">
          Ver agenda completa
        </Link>
      </section>
    );
  }

  return (
    <section aria-label="Próximos compromissos" className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-[var(--color-ink)]">Próximos compromissos</h2>
        <Link href="/app/agenda" className="text-sm font-semibold text-[var(--color-link)]">
          Ver agenda completa
        </Link>
      </div>
      <ul className="space-y-2">
        {visible.map((item) => {
          const isPriority = priorityEntityId === item.id;
          return (
            <li key={item.id}>
              <Link
                href={`/app/appointments/${item.id}`}
                className={[
                  "block rounded-[var(--radius-md)] border px-3 py-3 transition-colors",
                  isPriority
                    ? "border-[var(--color-border)] bg-[var(--color-surface-subtle)]/80"
                    : "border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-primary-subtle)]/40",
                ].join(" ")}
              >
                <p className="font-semibold text-[var(--color-ink)]">
                  {appointmentTime(item, timeZone)} · {item.client_name}
                </p>
                <p className="text-sm text-[var(--color-ink-muted)]">
                  {[item.service_name || item.cycle_service_name, item.location_name]
                    .filter(Boolean)
                    .join(" · ") || "Compromisso"}
                  {isPriority ? " · em foco acima" : ""}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
      {hasMore ? (
        <Link href="/app/agenda" className="text-sm font-semibold text-[var(--color-link)]">
          Ver agenda completa
        </Link>
      ) : null}
    </section>
  );
}

function attentionIcon(kind: string) {
  if (kind === "pending_payment" || kind === "payment_report_pending") {
    return <IconBanknote className="h-4 w-4" aria-hidden />;
  }
  if (kind === "cycle_nearing_end" || kind === "renewal_requested" || kind === "renewal_awaiting") {
    return <IconRefreshCw className="h-4 w-4" aria-hidden />;
  }
  if (kind === "appointment_needs_outcome") {
    return <IconCalendarDays className="h-4 w-4" aria-hidden />;
  }
  return <IconAlertCircle className="h-4 w-4" aria-hidden />;
}

function AttentionSection({
  items,
  priorityEntityId,
}: {
  items: AttentionItem[];
  priorityEntityId?: string | null;
}) {
  if (!items.length) {
    return (
      <section aria-label="Precisa de atenção" className="space-y-2">
        <h2 className="text-base font-semibold text-[var(--color-ink)]">Precisa de atenção</h2>
        <p className="text-sm text-[var(--color-ink-muted)]">
          Tudo certo por aqui. Não há ciclos, renovações ou outras situações aguardando sua ação.
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Precisa de atenção" className="space-y-2">
      <h2 className="text-base font-semibold text-[var(--color-ink)]">
        Precisa de atenção · {items.length}
      </h2>
      <ul className="divide-y divide-[var(--color-border)] overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        {items.map((item) => {
          const compact = priorityEntityId === item.entity_id;
          return (
            <li key={`${item.kind}-${item.entity_id}`}>
              <Link
                href={item.href}
                className={[
                  "flex min-h-11 items-start gap-3 px-3 py-3 transition-colors hover:bg-[var(--color-surface-subtle)]",
                  compact ? "opacity-80" : "",
                ].join(" ")}
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

export function TodayBoard({ summary }: Props) {
  const { me } = useAuth();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const hour = hourInTimeZone(now, summary.timezone);
  const greeting = greetingForHour(hour);
  const name = firstName(me?.user.full_name);
  const headline = name ? `${greeting}, ${name}` : greeting;

  const upcoming =
    summary.upcoming_appointments ??
    summary.today_appointments.filter((a) => new Date(a.ends_at).getTime() > now.getTime());

  const attention = summary.attention_items ?? [];
  const hasAttention = attention.length > 0;
  const priority = summary.priority_action;
  const fullyClear = !priority && !hasAttention && upcoming.length === 0;

  return (
    <div className="space-y-5 animate-fade-up">
      <header className="space-y-1">
        <h1 className="h-display text-3xl text-[var(--color-ink)] md:text-[2rem]">{headline}</h1>
        <p className="text-sm text-[var(--color-ink-muted)]">
          {summary.message || "Veja o que precisa da sua atenção hoje."}
        </p>
      </header>

      {fullyClear ? (
        <EmptyState
          tone="success"
          title="Tudo organizado"
          description="Você não possui nenhuma pendência para revisar agora."
          action={
            <Link href="/app/agenda">
              <Button variant="secondary">Abrir Agenda</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start">
          <div className="space-y-5">
            {priority ? (
              <PriorityCard action={priority} />
            ) : !hasAttention ? (
              <OrganizedCard
                message={
                  summary.message ||
                  "Você não possui nenhuma pendência importante neste momento."
                }
              />
            ) : null}
            <UpcomingAppointments
              items={upcoming}
              timeZone={summary.timezone}
              priorityEntityId={priority?.entity_id}
            />
          </div>
          <AttentionSection items={attention} priorityEntityId={priority?.entity_id} />
        </div>
      )}
    </div>
  );
}
