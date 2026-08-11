"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch, type OrganizationDetail } from "@/lib/api";

type TimelineEvent = {
  kind: string;
  label: string;
  occurred_at: string;
  metadata_safe?: Record<string, unknown>;
};

type Timeline = {
  organization_id: string;
  organization_name: string;
  events: TimelineEvent[];
};

export default function OrganizationDetailPage() {
  const params = useParams<{ organizationId: string }>();
  const [data, setData] = useState<OrganizationDetail | null>(null);
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [detail, tl] = await Promise.all([
        apiFetch<OrganizationDetail>(`/api/v1/platform/organizations/${params.organizationId}`),
        apiFetch<Timeline>(`/api/v1/platform/organizations/${params.organizationId}/timeline`),
      ]);
      if (cancelled) return;
      if (detail.error) setError(detail.error.message);
      else setData(detail.data ?? null);
      if (!tl.error) setTimeline(tl.data ?? null);
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
    <div className="space-y-5">
      <Link href="/organizations" className="text-sm font-semibold text-[var(--color-primary)]">
        ← Organizações
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="h-display text-3xl">{data.name}</h1>
        <span className="rounded bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold uppercase text-amber-800">
          HML
        </span>
      </div>
      <dl className="grid gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase text-[var(--color-ink-muted)]">Status operacional</dt>
          <dd>{data.operational_status ?? data.status}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-[var(--color-ink-muted)]">Assinatura / trial</dt>
          <dd>{data.subscription_status ?? data.plan_code}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-[var(--color-ink-muted)]">Profissional</dt>
          <dd>{data.owner_name ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-[var(--color-ink-muted)]">E-mail (mascarado)</dt>
          <dd>{data.owner_email_masked ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-[var(--color-ink-muted)]">Cadastro</dt>
          <dd>{new Date(data.created_at).toLocaleString("pt-BR")}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-[var(--color-ink-muted)]">Último acesso</dt>
          <dd>
            {data.last_login_at
              ? new Date(data.last_login_at).toLocaleString("pt-BR")
              : data.last_activity_at
                ? new Date(data.last_activity_at).toLocaleString("pt-BR")
                : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-[var(--color-ink-muted)]">Clientes / Ciclos / Agenda</dt>
          <dd>
            {data.clients_count} / {data.cycles_count} / {data.appointments_count ?? 0}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-[var(--color-ink-muted)]">Uso do Assistente</dt>
          <dd>{data.assistant_threads_count ?? 0} conversa(s)</dd>
        </div>
      </dl>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Timeline administrativa</h2>
        {!timeline || timeline.events.length === 0 ? (
          <p className="rounded border border-dashed border-[var(--color-border)] p-3 text-sm text-[var(--color-ink-muted)]">
            Sem eventos persistidos além do cadastro (ou dados ainda não existentes).
          </p>
        ) : (
          <ol className="space-y-2 border-l border-[var(--color-border)] pl-4">
            {timeline.events.map((ev) => (
              <li key={`${ev.kind}-${ev.occurred_at}`} className="relative">
                <span className="absolute -left-[1.15rem] top-1.5 h-2 w-2 rounded-full bg-[var(--color-primary)]" />
                <p className="text-sm font-semibold">{ev.label}</p>
                <p className="text-xs text-[var(--color-ink-muted)]">
                  {new Date(ev.occurred_at).toLocaleString("pt-BR")} · {ev.kind}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <p className="text-sm text-[var(--color-ink-muted)]">
        Sem impersonação, exclusão física ou alteração silenciosa dos dados da profissional nesta
        etapa.
      </p>
    </div>
  );
}
