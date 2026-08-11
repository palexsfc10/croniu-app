"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";

type ErrorItem = {
  key: string;
  service: string;
  operation: string;
  organization_id: string | null;
  error_code: string | null;
  message_sanitized: string | null;
  occurrences: number;
  last_seen_at: string;
  correlation_id: string | null;
  investigation_status: string;
};

type ErrorsResponse = {
  items: ErrorItem[];
  total: number;
  note?: string;
};

export default function ErrorsPage() {
  const [data, setData] = useState<ErrorsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const result = await apiFetch<ErrorsResponse>("/api/v1/platform/errors?limit=50");
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setError(null);
    setData(result.data ?? null);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount load
    void load();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="h-display text-3xl">Erros (sanitizados)</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            {data?.note || "Visão mínima a partir de runs e auditoria de IA."}
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={() => void load()}>
          Atualizar
        </Button>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}

      {!data ? (
        <p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p>
      ) : data.items.length === 0 ? (
        <p className="rounded border border-dashed border-[var(--color-border)] p-4 text-sm text-[var(--color-ink-muted)]">
          Nenhum erro relevante nos últimos 14 dias.
        </p>
      ) : (
        <div className="overflow-x-auto rounded border border-[var(--color-border)] bg-[var(--color-surface)]">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--color-border)] text-xs uppercase text-[var(--color-ink-muted)]">
              <tr>
                <th className="px-3 py-2">Quando</th>
                <th className="px-3 py-2">Serviço</th>
                <th className="px-3 py-2">Operação</th>
                <th className="px-3 py-2">Código</th>
                <th className="px-3 py-2">Ocorrências</th>
                <th className="px-3 py-2">Correlation</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((row) => (
                <tr key={row.key} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-3 py-3">
                    {new Date(row.last_seen_at).toLocaleString("pt-BR")}
                  </td>
                  <td className="px-3 py-3">{row.service}</td>
                  <td className="px-3 py-3">
                    <div>{row.operation}</div>
                    <div className="text-xs text-[var(--color-ink-muted)]">
                      {row.message_sanitized || "—"}
                    </div>
                  </td>
                  <td className="px-3 py-3">{row.error_code || "—"}</td>
                  <td className="px-3 py-3 tabular-nums">{row.occurrences}</td>
                  <td className="px-3 py-3 break-all text-xs">{row.correlation_id || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
