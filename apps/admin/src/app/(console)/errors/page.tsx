"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { CopyableId } from "@/components/ui/copyable-id";
import { Table, THead, Th, TBody, Tr, Td, TableSkeleton } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { IconBug } from "@/components/ui/icons";

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
        <TableSkeleton columns={6} />
      ) : data.items.length === 0 ? (
        <EmptyState icon={<IconBug className="h-8 w-8" />} title="Nenhum erro relevante nos últimos 14 dias" />
      ) : (
        <Table>
          <THead>
            <Th>Quando</Th>
            <Th>Serviço</Th>
            <Th>Operação</Th>
            <Th>Código</Th>
            <Th>Ocorrências</Th>
            <Th>Correlation</Th>
          </THead>
          <TBody>
            {data.items.map((row) => (
              <Tr key={row.key}>
                <Td>{new Date(row.last_seen_at).toLocaleString("pt-BR")}</Td>
                <Td>{row.service}</Td>
                <Td>
                  <div>{row.operation}</div>
                  <div className="text-xs text-[var(--color-ink-muted)]">
                    {row.message_sanitized || "—"}
                  </div>
                </Td>
                <Td>{row.error_code || "—"}</Td>
                <Td className="tabular-nums">{row.occurrences}</Td>
                <Td>{row.correlation_id ? <CopyableId value={row.correlation_id} label="correlation id" /> : "—"}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
