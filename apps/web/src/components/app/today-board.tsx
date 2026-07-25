import Link from "next/link";
import type { Appointment, Cycle, HomeSummary, PriorityAction, Receivable } from "@/lib/api";
import { appointmentStatusLabel, formatBRL, formatOrgDateTime } from "@/lib/api";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { ContextualBar } from "@/components/app/contextual-bar";

type Props = {
  summary: HomeSummary;
};

function PriorityCard({ action }: { action: PriorityAction }) {
  return (
    <section
      aria-label="Ação prioritária"
      className="rounded-[var(--radius-lg)] border border-[var(--color-primary)]/25 bg-[var(--color-surface)] p-4 shadow-[var(--shadow-sm)]"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-primary)]">
        Ação prioritária
      </p>
      <h2 className="mt-1 text-lg font-semibold text-[var(--color-ink)]">{action.title}</h2>
      <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{action.subtitle}</p>
      <Link href={action.href} className="mt-3 inline-block">
        <Button>Abrir</Button>
      </Link>
    </section>
  );
}

function AppointmentList({
  items,
  timeZone,
}: {
  items: Appointment[];
  timeZone: string;
}) {
  const active = items.filter((item) => item.status === "scheduled");
  if (!active.length) {
    return (
      <EmptyState
        title="Compromissos de hoje"
        description="Nenhum compromisso agendado para hoje no fuso da organização."
        action={
          <Link href="/app/agenda">
            <Button variant="secondary">Abrir Agenda</Button>
          </Link>
        }
      />
    );
  }
  return (
    <section aria-label="Compromissos de hoje" className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-[var(--color-ink)]">Compromissos de hoje</h2>
        <Link href="/app/agenda" className="text-sm font-semibold text-[var(--color-primary)]">
          Agenda
        </Link>
      </div>
      <ul className="space-y-2">
        {active.map((item) => (
          <li key={item.id}>
            <Link
              href={`/app/appointments/${item.id}`}
              className="block rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3"
            >
              <p className="font-semibold text-[var(--color-ink)]">
                {formatOrgDateTime(item.starts_at, timeZone)} · {item.client_name}
              </p>
              <p className="text-sm text-[var(--color-ink-muted)]">
                {item.location_name || "Sem local"} · {appointmentStatusLabel(item.status)}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CycleList({ items }: { items: Cycle[] }) {
  if (!items.length) {
    return (
      <EmptyState
        title="Ciclos encerrando"
        description="Ciclos próximos do fim serão listados para você agir a tempo."
      />
    );
  }
  return (
    <section aria-label="Ciclos encerrando" className="space-y-2">
      <h2 className="text-base font-semibold text-[var(--color-ink)]">Ciclos encerrando</h2>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={`/app/cycles/${item.id}`}
              className="block rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3"
            >
              <p className="font-semibold text-[var(--color-ink)]">{item.client_name}</p>
              <p className="text-sm text-[var(--color-ink-muted)]">
                {item.service_name} · encerra {item.ends_on}
                {item.days_remaining != null ? ` (${item.days_remaining}d)` : ""}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PaymentList({ items }: { items: Receivable[] }) {
  if (!items.length) {
    return (
      <EmptyState
        title="Pagamentos pendentes"
        description="Valores aguardando confirmação manual serão destacados aqui."
      />
    );
  }
  return (
    <section aria-label="Pagamentos pendentes" className="space-y-2">
      <h2 className="text-base font-semibold text-[var(--color-ink)]">Pagamentos pendentes</h2>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={`/app/receivables/${item.id}`}
              className="block rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3"
            >
              <p className="font-semibold text-[var(--color-ink)]">{item.client_name}</p>
              <p className="text-sm text-[var(--color-ink-muted)]">
                {formatBRL(item.amount_cents)} · vence {item.due_on}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function TodayBoard({ summary }: Props) {
  return (
    <div className="space-y-4 animate-fade-up">
      <ContextualBar
        label={summary.priority_action?.title ?? null}
        href={summary.priority_action?.href ?? null}
      />
      <div>
        <h1 className="h-display text-3xl text-[var(--color-ink)]">Hoje</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Fuso {summary.timezone} · {summary.local_today}
        </p>
      </div>
      {summary.contextual_hint ? (
        <p
          role="status"
          className="rounded-[var(--radius-md)] bg-[var(--color-surface-muted)] px-3 py-2 text-sm text-[var(--color-ink-muted)]"
        >
          {summary.contextual_hint}
        </p>
      ) : null}
      {summary.priority_action ? <PriorityCard action={summary.priority_action} /> : null}
      <AppointmentList items={summary.today_appointments} timeZone={summary.timezone} />
      <CycleList items={summary.cycles_nearing_end} />
      <PaymentList items={summary.pending_payments} />
    </div>
  );
}
