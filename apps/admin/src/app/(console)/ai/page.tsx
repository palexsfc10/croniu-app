"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type AiOps = {
  configured: boolean;
  ai_enabled: boolean;
  provider: string;
  model: string;
  api_key_configured: boolean;
  requests_today: number;
  tokens_today: number;
  estimated_cost_cents_today: number;
  errors_today: number;
  requests_month: number;
  tokens_month: number;
  estimated_cost_cents_month: number;
  avg_latency_ms_7d: number | null;
  actions_pending: number;
  actions_executed_30d: number;
  actions_cancelled_30d: number;
  actions_expired_30d: number;
  limits: {
    user_requests_per_minute: number;
    org_daily_request_limit: number;
    confirmation_ttl_seconds: number;
  };
  top_organizations_month: Array<{
    organization_id: string;
    requests: number;
    tokens: number;
  }>;
  note?: string;
};

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-[var(--color-ink)]">{value}</p>
    </div>
  );
}

export default function AiOpsPage() {
  const [data, setData] = useState<AiOps | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await apiFetch<AiOps>("/api/v1/platform/ai-ops");
      if (cancelled) return;
      if (result.error) {
        setError(result.error.message);
        return;
      }
      setData(result.data || null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <p className="text-sm text-[var(--color-danger)]">{error}</p>;
  }
  if (!data) {
    return <p className="text-sm text-[var(--color-ink-muted)]">Carregando métricas de IA…</p>;
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-[var(--color-ink)]">Assistente IA</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Visão operacional sanitizada. Conversas completas não são listadas aqui.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="IA habilitada" value={data.ai_enabled ? "Sim" : "Não"} />
        <Metric label="Provedor" value={data.provider} />
        <Metric label="Modelo" value={data.model} />
        <Metric label="Chave configurada" value={data.api_key_configured ? "Sim" : "Não"} />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Requisições hoje" value={data.requests_today} />
        <Metric label="Tokens hoje" value={data.tokens_today} />
        <Metric label="Custo est. hoje (¢)" value={data.estimated_cost_cents_today} />
        <Metric label="Erros hoje" value={data.errors_today} />
        <Metric label="Requisições mês" value={data.requests_month} />
        <Metric label="Tokens mês" value={data.tokens_month} />
        <Metric label="Custo est. mês (¢)" value={data.estimated_cost_cents_month} />
        <Metric
          label="Latência média 7d (ms)"
          value={data.avg_latency_ms_7d != null ? Math.round(data.avg_latency_ms_7d) : "—"}
        />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Ações pendentes" value={data.actions_pending} />
        <Metric label="Executadas 30d" value={data.actions_executed_30d} />
        <Metric label="Canceladas 30d" value={data.actions_cancelled_30d} />
        <Metric label="Expiradas 30d" value={data.actions_expired_30d} />
      </section>

      <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-3 text-sm">
        <h2 className="font-semibold text-[var(--color-ink)]">Limites</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--color-ink-muted)]">
          <li>{data.limits.user_requests_per_minute} req/min por usuário</li>
          <li>{data.limits.org_daily_request_limit} req/dia por organização</li>
          <li>TTL de confirmação: {data.limits.confirmation_ttl_seconds}s</li>
        </ul>
        <p className="mt-3 text-[var(--color-ink-muted)]">
          Kill switch global: `AI_ENABLED=false` no `.env` da API (sem edição de segredo pelo
          navegador).
        </p>
      </section>

      {data.top_organizations_month.length ? (
        <section>
          <h2 className="mb-2 font-semibold text-[var(--color-ink)]">Top organizações (mês)</h2>
          <ul className="divide-y divide-[var(--color-border)] rounded-[var(--radius-md)] border border-[var(--color-border)]">
            {data.top_organizations_month.map((row) => (
              <li
                key={row.organization_id}
                className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
              >
                <span className="font-mono text-xs text-[var(--color-ink-muted)]">
                  {row.organization_id.slice(0, 8)}…
                </span>
                <span className="tabular-nums text-[var(--color-ink)]">
                  {row.requests} req · {row.tokens} tok
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.note ? <p className="text-xs text-[var(--color-ink-muted)]">{data.note}</p> : null}
    </div>
  );
}
