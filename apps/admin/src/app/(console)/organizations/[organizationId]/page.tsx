"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch, type OrganizationDetail } from "@/lib/api";

export default function OrganizationDetailPage() {
  const params = useParams<{ organizationId: string }>();
  const [data, setData] = useState<OrganizationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const result = await apiFetch<OrganizationDetail>(
        `/api/v1/platform/organizations/${params.organizationId}`,
      );
      if (cancelled) return;
      if (result.error) setError(result.error.message);
      else setData(result.data ?? null);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [params.organizationId]);

  if (loading) return <p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p>;
  if (error) {
    return (
      <p role="alert" className="text-sm text-[var(--color-danger)]">
        {error}
      </p>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-4">
      <Link href="/organizations" className="text-sm font-semibold text-[var(--color-primary)]">
        ← Organizações
      </Link>
      <h1 className="h-display text-3xl">{data.name}</h1>
      <dl className="grid gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase text-[var(--color-ink-muted)]">ID</dt>
          <dd className="break-all text-sm">{data.id}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-[var(--color-ink-muted)]">Status</dt>
          <dd>{data.status}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-[var(--color-ink-muted)]">Plano</dt>
          <dd>{data.plan_code}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-[var(--color-ink-muted)]">Proprietário</dt>
          <dd>{data.owner_name ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-[var(--color-ink-muted)]">E-mail (suporte)</dt>
          <dd>{data.owner_email ?? data.owner_email_masked ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-[var(--color-ink-muted)]">Criada em</dt>
          <dd>{new Date(data.created_at).toLocaleString("pt-BR")}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-[var(--color-ink-muted)]">Última atividade</dt>
          <dd>
            {data.last_activity_at
              ? new Date(data.last_activity_at).toLocaleString("pt-BR")
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-[var(--color-ink-muted)]">Clientes / Ciclos</dt>
          <dd>
            {data.clients_count} / {data.cycles_count}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-[var(--color-ink-muted)]">Fuso</dt>
          <dd>{data.timezone ?? "America/Sao_Paulo"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-[var(--color-ink-muted)]">Compromissos</dt>
          <dd>{data.appointments_count ?? 0}</dd>
        </div>
      </dl>
      <p className="text-sm text-[var(--color-ink-muted)]">
        Ações mutáveis (suspender, ajustar trial) permanecem bloqueadas nesta fundação.
      </p>
    </div>
  );
}
