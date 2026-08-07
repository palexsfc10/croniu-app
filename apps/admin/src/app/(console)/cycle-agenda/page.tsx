"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";

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
              className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
            >
              <p className="text-[11px] uppercase text-[var(--color-ink-muted)]">{LABEL[key]}</p>
              <p className="text-xl font-semibold tabular-nums">{data.summary[key]}</p>
            </div>
          ))}
          <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
            <p className="text-[11px] uppercase text-[var(--color-ink-muted)]">Órfãos</p>
            <p className="text-xl font-semibold tabular-nums">
              {data.summary.orphan_appointments}
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <select
          className="min-h-11 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm"
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
          className="min-h-11 min-w-[16rem] rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm"
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
        <p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p>
      ) : data.items.length === 0 ? (
        <p className="rounded border border-dashed border-[var(--color-border)] p-4 text-sm text-[var(--color-ink-muted)]">
          Nenhum ciclo encontrado com os filtros atuais.
        </p>
      ) : (
        <div className="overflow-x-auto rounded border border-[var(--color-border)] bg-[var(--color-surface)]">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--color-border)] text-xs uppercase text-[var(--color-ink-muted)]">
              <tr>
                <th className="px-3 py-2">Organização</th>
                <th className="px-3 py-2">Previstas</th>
                <th className="px-3 py-2">Criadas</th>
                <th className="px-3 py-2">Integridade</th>
                <th className="px-3 py-2">Origem</th>
                <th className="px-3 py-2">Última ocorrência</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((row) => (
                <tr key={row.cycle_id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-3 py-3">
                    <Link
                      className="font-semibold text-[var(--color-primary)]"
                      href={`/organizations/${row.organization_id}`}
                    >
                      {row.organization_name}
                    </Link>
                    <div className="text-xs text-[var(--color-ink-muted)]">{row.cycle_id}</div>
                  </td>
                  <td className="px-3 py-3 tabular-nums">{row.planned_sessions ?? "—"}</td>
                  <td className="px-3 py-3 tabular-nums">{row.appointments_created}</td>
                  <td className="px-3 py-3">
                    <span
                      className={
                        row.integrity === "critical"
                          ? "font-semibold text-[var(--color-danger)]"
                          : row.integrity === "divergent"
                            ? "font-semibold text-amber-700"
                            : ""
                      }
                    >
                      {LABEL[row.integrity] || row.integrity}
                    </span>
                  </td>
                  <td className="px-3 py-3">{row.origin}</td>
                  <td className="px-3 py-3">
                    {row.last_appointment_at
                      ? new Date(row.last_appointment_at).toLocaleString("pt-BR")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
