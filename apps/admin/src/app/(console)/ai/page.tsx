"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, THead, Th, TBody, Tr, Td, TableSkeleton } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonMetricGrid } from "@/components/ui/skeleton";
import { IconSparkles } from "@/components/ui/icons";
import { statusTone } from "@/lib/status-tone";

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
  note?: string;
};

type AiRun = {
  run_id: string;
  organization_id: string;
  organization_name?: string | null;
  professional_name?: string | null;
  thread_id: string;
  started_at: string | null;
  provider: string;
  model: string;
  status: string;
  latency_ms: number | null;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_cents: number;
  provider_request_id: string | null;
  error_code: string | null;
  tools_requested: string[];
  tools_executed: Array<{ name: string; status: string; latency_ms: number | null }>;
  proposal: {
    action_id: string;
    tool_name: string;
    status: string;
    error_sanitized: string | null;
    request_id: string | null;
  } | null;
  sensitive_content_hidden: boolean;
};

type AiRunsResponse = {
  items: AiRun[];
  total: number;
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
  const [runs, setRuns] = useState<AiRunsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [proposalStatus, setProposalStatus] = useState("");
  const [messageType, setMessageType] = useState("");
  const [orgId, setOrgId] = useState("");

  async function loadRuns() {
    const params = new URLSearchParams({ page: "1", page_size: "30" });
    if (status) params.set("status", status);
    if (proposalStatus) params.set("proposal_status", proposalStatus);
    if (messageType) params.set("message_type", messageType);
    if (orgId.trim()) params.set("organization_id", orgId.trim());
    const result = await apiFetch<AiRunsResponse>(`/api/v1/platform/ai-runs?${params}`);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setRuns(result.data ?? null);
  }

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
      await loadRuns();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error && !data) {
    return (
      <Card rail="danger">
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      </Card>
    );
  }

  if (!data) {
    return (
      <div className="space-y-5">
        <h1 className="h-display text-3xl">Assistente IA</h1>
        <SkeletonMetricGrid count={8} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="h-display text-3xl">Assistente IA</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Metadados operacionais. Conversas privadas não são listadas por padrão.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="IA habilitada" value={data.ai_enabled ? "Sim" : "Não"} />
        <Metric label="Provedor" value={data.provider} />
        <Metric label="Modelo" value={data.model} />
        <Metric label="Chave configurada" value={data.api_key_configured ? "Sim" : "Não"} />
        <Metric label="Req hoje" value={data.requests_today} />
        <Metric label="Erros hoje" value={data.errors_today} />
        <Metric label="Pendentes" value={data.actions_pending} />
        <Metric label="Confirmadas 30d" value={data.actions_executed_30d} />
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="font-semibold text-[var(--color-ink)]">Execuções recentes</h2>
          <div className="flex flex-wrap gap-2">
            <select
              className="min-h-10 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">Status run</option>
              <option value="ok">sucesso</option>
              <option value="error">erro</option>
              <option value="failed">falha</option>
            </select>
            <select
              className="min-h-10 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm"
              value={proposalStatus}
              onChange={(e) => setProposalStatus(e.target.value)}
            >
              <option value="">Proposta</option>
              <option value="awaiting_confirmation">aguardando</option>
              <option value="confirmed">confirmado</option>
              <option value="cancelled">cancelado</option>
            </select>
            <select
              className="min-h-10 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm"
              value={messageType}
              onChange={(e) => setMessageType(e.target.value)}
            >
              <option value="">texto/voz</option>
              <option value="text">texto</option>
              <option value="voice">voz</option>
            </select>
            <input
              className="min-h-10 min-w-[12rem] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm"
              placeholder="organization_id"
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
            />
            <Button type="button" variant="secondary" size="sm" onClick={() => void loadRuns()}>
              Filtrar
            </Button>
          </div>
        </div>

        {error ? <p className="text-sm text-[var(--color-danger)]">{error}</p> : null}

        {!runs ? (
          <TableSkeleton columns={6} />
        ) : runs.items.length === 0 ? (
          <EmptyState icon={<IconSparkles className="h-8 w-8" />} title="Nenhuma execução com os filtros atuais" />
        ) : (
          <Table>
            <THead>
              <Th>Quando</Th>
              <Th>Org / profissional</Th>
              <Th>Status</Th>
              <Th>Modelo</Th>
              <Th>Latência / tokens</Th>
              <Th>Tools / proposta</Th>
            </THead>
            <TBody>
              {runs.items.map((run) => (
                <Tr key={run.run_id}>
                  <Td>
                    {run.started_at ? new Date(run.started_at).toLocaleString("pt-BR") : "—"}
                    <div className="text-[11px] text-[var(--color-ink-muted)]">
                      {run.provider_request_id || run.run_id.slice(0, 8)}
                    </div>
                  </Td>
                  <Td>
                    <div>{run.organization_name || run.organization_id.slice(0, 8)}</div>
                    <div className="text-xs text-[var(--color-ink-muted)]">
                      {run.professional_name || "—"}
                    </div>
                  </Td>
                  <Td>
                    <Badge tone={statusTone(run.status)}>{run.status}</Badge>
                    {run.error_code ? (
                      <div className="mt-1 text-xs text-[var(--color-danger)]">{run.error_code}</div>
                    ) : null}
                  </Td>
                  <Td>
                    {run.provider}/{run.model}
                  </Td>
                  <Td className="tabular-nums">
                    {run.latency_ms ?? "—"} ms
                    <div className="text-xs text-[var(--color-ink-muted)]">
                      in {run.input_tokens} / out {run.output_tokens} · {run.estimated_cost_cents}¢
                    </div>
                  </Td>
                  <Td>
                    <div className="text-xs">{run.tools_requested.join(", ") || "—"}</div>
                    {run.proposal ? (
                      <div className="mt-1 text-xs text-[var(--color-ink-muted)]">
                        proposta {run.proposal.tool_name}: {run.proposal.status}
                        {run.proposal.error_sanitized ? ` · ${run.proposal.error_sanitized}` : ""}
                      </div>
                    ) : null}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
        {runs?.note ? <p className="text-xs text-[var(--color-ink-muted)]">{runs.note}</p> : null}
      </section>
    </div>
  );
}
