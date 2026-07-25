"use client";

import { useEffect, useState } from "react";
import { apiFetch, type OverviewMetrics } from "@/lib/api";

function MetricCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <p className="text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
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

  if (loading) return <p className="text-sm text-[var(--color-ink-muted)]">Carregando métricas…</p>;
  if (error) {
    return (
      <p role="alert" className="text-sm text-[var(--color-danger)]">
        {error}
      </p>
    );
  }
  if (!data) {
    return <p className="text-sm text-[var(--color-ink-muted)]">Sem dados disponíveis.</p>;
  }

  const empty =
    data.organizations_total === 0 &&
    data.professionals_total === 0 &&
    data.registrations_last_7_days === 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="h-display text-3xl">Visão geral</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Atualizado em {new Date(data.generated_at).toLocaleString("pt-BR")}
        </p>
      </div>
      {empty ? (
        <p className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-ink-muted)]">
          Nenhuma organização cadastrada ainda. As métricas refletem zero real — sem dados fictícios.
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard label="Organizações" value={data.organizations_total} />
        <MetricCard label="Profissionais" value={data.professionals_total} />
        <MetricCard label="Cadastros (7 dias)" value={data.registrations_last_7_days} />
        <MetricCard label="Ativas" value={data.organizations_active} />
        <MetricCard label="Em avaliação" value={data.organizations_evaluating} />
        <MetricCard label="Suspensas" value={data.organizations_suspended} />
        <MetricCard label="Clientes ativos (agregado)" value={data.clients_active_total} />
      </div>
    </div>
  );
}
