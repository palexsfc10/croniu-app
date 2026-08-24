"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, type OverviewMetrics } from "@/lib/api";
import { presentCroniuEnvironment } from "@/lib/environment";
import { Card } from "@/components/ui/card";
import { SkeletonMetricGrid } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "warn" | "danger" | "ok";
}) {
  const railClass =
    tone === "danger"
      ? "border-[var(--color-danger)]/45"
      : tone === "warn"
        ? "border-[var(--color-warning)]/45"
        : "border-[var(--color-border)]";
  return (
    <div className={`rounded-[var(--radius-lg)] border bg-[var(--color-surface)] p-3 ${railClass}`}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--color-ink)]">{value}</p>
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<OverviewMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const result = await apiFetch<OverviewMetrics>("/api/v1/platform/overview");
      if (cancelled) return;
      if (result.error) setError(result.error.message);
      else setData(result.data ?? null);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <Card rail="danger" className="space-y-2">
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
        <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
          Tentar novamente
        </Button>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="h-display text-3xl">Visão operacional</h1>
        </div>
        <SkeletonMetricGrid count={11} />
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-[var(--color-ink-muted)]">Sem dados disponíveis.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="h-display text-3xl">Visão operacional</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            Atualizado em {new Date(data.generated_at).toLocaleString("pt-BR")} · ambiente{" "}
            {presentCroniuEnvironment(data.environment).headline}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link className="font-semibold text-[var(--color-primary)] hover:underline" href="/cycle-agenda">
            Integridade ciclo–agenda
          </Link>
          <Link className="font-semibold text-[var(--color-primary)] hover:underline" href="/errors">
            Erros
          </Link>
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
          Cadastro e billing
        </h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Organizações" value={data.organizations_total} />
          <MetricCard label="Profissionais" value={data.professionals_total} />
          <MetricCard label="Cadastros 24h" value={data.registrations_last_24_hours ?? 0} />
          <MetricCard label="Cadastros 7d" value={data.registrations_last_7_days} />
          <MetricCard label="Em trial" value={data.organizations_in_trial ?? 0} />
          <MetricCard
            label="Trials acabando (3d)"
            value={data.trials_ending_soon ?? 0}
            tone={(data.trials_ending_soon ?? 0) > 0 ? "warn" : undefined}
          />
          <MetricCard label="Assinaturas ativas" value={data.subscriptions_active ?? 0} />
          <MetricCard
            label="Vencidas / pendentes"
            value={data.subscriptions_past_due_or_expired ?? 0}
            tone={(data.subscriptions_past_due_or_expired ?? 0) > 0 ? "warn" : undefined}
          />
          <MetricCard
            label="Bloqueadas / suspensas"
            value={data.subscriptions_suspended_or_blocked ?? 0}
            tone={(data.subscriptions_suspended_or_blocked ?? 0) > 0 ? "danger" : undefined}
          />
          <MetricCard label="Orgs ativas" value={data.organizations_active} />
          <MetricCard label="Em avaliação" value={data.organizations_evaluating} />
          <MetricCard label="Suspensas" value={data.organizations_suspended} />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
          Uso do produto
        </h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Clientes ativos" value={data.clients_active_total} />
          <MetricCard label="Ciclos" value={data.cycles_total ?? 0} />
          <MetricCard label="Compromissos" value={data.appointments_scheduled_total ?? 0} />
          <MetricCard label="Recebíveis" value={data.receivables_total ?? 0} />
          <MetricCard
            label="Ciclo–agenda crítico"
            value={data.cycle_agenda_critical ?? 0}
            tone={(data.cycle_agenda_critical ?? 0) > 0 ? "danger" : "ok"}
          />
          <MetricCard
            label="Ciclo–agenda divergente"
            value={data.cycle_agenda_divergent ?? 0}
            tone={(data.cycle_agenda_divergent ?? 0) > 0 ? "warn" : undefined}
          />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
          Assistente e feedback
        </h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Conversas IA" value={data.assistant_threads_total ?? 0} />
          <MetricCard label="Propostas geradas" value={data.ai_proposals_generated ?? 0} />
          <MetricCard label="Propostas confirmadas" value={data.ai_proposals_confirmed ?? 0} />
          <MetricCard
            label="Falhas IA (7d)"
            value={data.ai_failures_recent ?? 0}
            tone={(data.ai_failures_recent ?? 0) > 0 ? "danger" : undefined}
          />
          <MetricCard
            label="Feedbacks novos"
            value={data.feedbacks_new ?? 0}
            tone={(data.feedbacks_new ?? 0) > 0 ? "warn" : undefined}
          />
          <MetricCard label="Erros recentes" value={data.errors_recent ?? 0} />
        </div>
      </section>
    </div>
  );
}
