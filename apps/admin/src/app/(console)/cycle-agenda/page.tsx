"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, Th, TBody, Tr, Td, TableSkeleton } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { IconCalendarCheck } from "@/components/ui/icons";
import type { BadgeTone } from "@/components/ui/badge";

type IntegrityItem = {
  cycle_id: string;
  organization_id: string;
  organization_name: string;
  cycle_status: string;
  planned_sessions: number | null;
  appointments_created: number;
  integrity: string;
  origin: string;
  last_appointment_at: string | null;
  created_at: string | null;
};

type IntegrityResponse = {
  items: IntegrityItem[];
  total: number;
  summary: {
    intact: number;
    divergent: number;
    critical: number;
    unknown: number;
    orphan_appointments: number;
  };
  note?: string;
};

const LABEL: Record<string, string> = {
  intact: "Íntegro",
  divergent: "Divergente",
  critical: "Crítico",
  unknown: "Desconhecido",
};

const INTEGRITY_TONE: Record<string, BadgeTone> = {
  intact: "success",
  divergent: "warning",
  critical: "danger",
  unknown: "neutral",
};

export default function CycleAgendaPage() {
  const [data, setData] = useState<IntegrityResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [orgId, setOrgId] = useState("");

  async function load() {
    const params = new URLSearchParams({ page: "1", page_size: "40" });
    if (status) params.set("status", status);
    if (orgId.trim()) params.set("organization_id", orgId.trim());
    const result = await apiFetch<IntegrityResponse>(
      `/api/v1/platform/cycle-agenda-integrity?${params}`,
    );
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setError(null);
    setData(result.data ?? null);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount/status reload
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="h-display text-3xl">Integridade ciclo–agenda</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Indicador operacional — sem reparo automático. {data?.note}
        </p>
      </div>

      {data ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {(["intact", "divergent", "critical", "unknown"] as const).map((key) => (
            <div
              key={key}
              className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
            >
              <p className="text-[11px] uppercase text-[var(--color-ink-muted)]">{LABEL[key]}</p>
              <p className="text-xl font-semibold tabular-nums">{data.summary[key]}</p>
            </div>
          ))}
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
            <p className="text-[11px] uppercase text-[var(--color-ink-muted)]">Órfãos</p>
            <p className="text-xl font-semibold tabular-nums">
              {data.summary.orphan_appointments}
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <select
          className="min-h-11 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Todos</option>
          <option value="critical">Crítico</option>
          <option value="divergent">Divergente</option>
          <option value="intact">Íntegro</option>
          <option value="unknown">Desconhecido</option>
        </select>
        <input
          className="min-h-11 min-w-[16rem] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm"
          placeholder="Filtrar organization_id"
          value={orgId}
          onChange={(e) => setOrgId(e.target.value)}
        />
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
        <EmptyState
          icon={<IconCalendarCheck className="h-8 w-8" />}
          title="Nenhum ciclo encontrado com os filtros atuais"
        />
      ) : (
        <Table>
          <THead>
            <Th>Organização</Th>
            <Th>Previstas</Th>
            <Th>Criadas</Th>
            <Th>Integridade</Th>
            <Th>Origem</Th>
            <Th>Última ocorrência</Th>
          </THead>
          <TBody>
            {data.items.map((row) => (
              <Tr key={row.cycle_id}>
                <Td>
                  <Link className="font-semibold text-[var(--color-primary)] hover:underline" href={`/organizations/${row.organization_id}`}>
                    {row.organization_name}
                  </Link>
                  <div className="text-xs text-[var(--color-ink-muted)]">{row.cycle_id}</div>
                </Td>
                <Td className="tabular-nums">{row.planned_sessions ?? "—"}</Td>
                <Td className="tabular-nums">{row.appointments_created}</Td>
                <Td>
                  <Badge tone={INTEGRITY_TONE[row.integrity] ?? "neutral"}>
                    {LABEL[row.integrity] || row.integrity}
                  </Badge>
                </Td>
                <Td>{row.origin}</Td>
                <Td>
                  {row.last_appointment_at
                    ? new Date(row.last_appointment_at).toLocaleString("pt-BR")
                    : "—"}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
