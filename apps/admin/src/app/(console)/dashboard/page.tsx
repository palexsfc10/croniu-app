"use client";

import Link from "next/link";
import type { ComponentType, SVGProps } from "react";
import type { OverviewMetrics } from "@/lib/api";
import { useAdminResource } from "@/lib/use-admin-resource";
import { formatAdminDate, formatCount } from "@/lib/presentation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { ResourceError } from "@/components/ui/resource-error";
import { SkeletonMetricGrid } from "@/components/ui/skeleton";
import { IconAlertTriangle, IconBuilding, IconCheck, IconChevronRight, IconClock, IconGift, IconMessage, IconUsers } from "@/components/ui/icons";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;
type Metric = { label: string; value: number | undefined; href: string; hint: string; icon: Icon };

function MetricCard({ label, value, href, hint, icon: Icon }: Metric) {
  return <Link href={href} className="metric-card group">
    <div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold text-[var(--color-ink-muted)]">{label}</span><Icon className="h-5 w-5 text-[var(--color-primary)]" /></div>
    <p className={`my-4 font-bold tracking-tight tabular-nums ${value == null ? "text-lg" : "text-4xl"}`}>{formatCount(value)}</p>
    <div className="flex items-center justify-between gap-2 text-xs text-[var(--color-ink-muted)]"><span>{hint}</span><IconChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></div>
  </Link>;
}

function DetailPanel({ title, description, href, items }: { title: string; description: string; href: string; items: { label: string; value: number | undefined }[] }) {
  return <section className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]">
    <div className="flex items-start justify-between gap-3 p-5"><div><h2 className="font-bold">{title}</h2><p className="mt-1 text-xs text-[var(--color-ink-muted)]">{description}</p></div><Link href={href} aria-label={`Abrir ${title}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--color-primary)] hover:bg-[var(--color-surface-subtle)]"><IconChevronRight className="h-4 w-4" /></Link></div>
    <dl className="divide-y divide-[var(--color-border)] border-t border-[var(--color-border)]">{items.map(({ label, value }) => <div key={label} className="flex items-center justify-between gap-4 px-5 py-3.5 text-sm"><dt className="text-[var(--color-ink-muted)]">{label}</dt><dd className="font-semibold tabular-nums">{formatCount(value)}</dd></div>)}</dl>
  </section>;
}

export default function DashboardPage() {
  const { data, error, loading, refresh } = useAdminResource<OverviewMetrics>("/api/v1/platform/overview");
  const attention = data ? [
    { label: "Integridade ciclo–agenda", hint: "Ciclos com ocorrências críticas", value: data.cycle_agenda_critical, href: "/cycle-agenda", tone: "danger" as const },
    { label: "Erros recentes", hint: "Consultar eventos e contexto", value: data.errors_recent, href: "/errors", tone: "danger" as const },
    { label: "Falhas do assistente", hint: "Falhas registradas nos últimos 7 dias", value: data.ai_failures_recent, href: "/ai", tone: "danger" as const },
    { label: "Testes próximos do fim", hint: "Vencimento nos próximos 3 dias", value: data.trials_ending_soon, href: "/organizations", tone: "warning" as const },
    { label: "Assinaturas vencidas ou pendentes", hint: "Conferir a situação de cada organização", value: data.subscriptions_past_due_or_expired, href: "/organizations", tone: "warning" as const },
    { label: "Feedbacks novos", hint: "Mensagens aguardando análise", value: data.feedbacks_new, href: "/feedbacks", tone: "info" as const },
    { label: "Divergências ciclo–agenda", hint: "Revisar o vínculo com a agenda", value: data.cycle_agenda_divergent, href: "/cycle-agenda", tone: "warning" as const },
    { label: "Assinaturas bloqueadas ou suspensas", hint: "Consultar os detalhes de acesso", value: data.subscriptions_suspended_or_blocked, href: "/organizations", tone: "warning" as const },
  ] : [];
  const pending = attention.filter((item) => item.value != null && item.value > 0);
  const unavailable = attention.filter((item) => item.value == null);

  return <div className="space-y-6">
    <PageHeader title="Visão geral" description="Acompanhe as contas, identifique pendências e acesse os controles da plataforma." eyebrow="Central de controle" actions={<Button variant="secondary" disabled={loading} onClick={refresh}><IconClock className="h-4 w-4" />{loading ? "Atualizando…" : "Atualizar dados"}</Button>} />
    {error ? <ResourceError message={error} retry={refresh} /> : null}
    {loading ? <div role="status" aria-label="Carregando visão geral"><SkeletonMetricGrid count={4} /></div> : null}
    {data ? <>
      <section aria-label="Resumo da plataforma" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Organizações" value={data.organizations_total} href="/organizations" hint={`${formatCount(data.organizations_active)} com status ativo`} icon={IconBuilding} />
        <MetricCard label="Profissionais" value={data.professionals_total} href="/users" hint={`${formatCount(data.registrations_last_7_days)} cadastros nos últimos 7 dias`} icon={IconUsers} />
        <MetricCard label="Assinaturas ativas" value={data.subscriptions_active} href="/organizations" hint="Acompanhar contas e assinaturas" icon={IconCheck} />
        <MetricCard label="Em período de teste" value={data.organizations_in_trial} href="/organizations" hint={`${formatCount(data.trials_ending_soon)} vencem nos próximos 3 dias`} icon={IconClock} />
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(260px,1fr)]">
        <section className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] p-5"><div><h2 className="flex items-center gap-2 font-bold"><IconAlertTriangle className="h-4 w-4 text-[var(--color-warning)]" />Precisa de atenção</h2><p className="mt-1.5 text-xs text-[var(--color-ink-muted)]">Abra cada área para analisar os registros.</p></div><Badge tone={pending.length ? "warning" : "neutral"}>{pending.length} {pending.length === 1 ? "categoria" : "categorias"}</Badge></div>
          {pending.length ? <ul className="divide-y divide-[var(--color-border)]">{pending.map((item) => <li key={item.label}><Link href={item.href} className="flex min-h-20 items-center gap-3 px-5 py-4 transition-colors hover:bg-[var(--color-surface-subtle)]"><Badge tone={item.tone}>{formatCount(item.value)}</Badge><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{item.label}</p><p className="mt-1 text-xs text-[var(--color-ink-muted)]">{item.hint}</p></div><IconChevronRight className="h-4 w-4 shrink-0 text-[var(--color-ink-muted)]" /></Link></li>)}</ul> : <div className="flex items-center gap-3 p-6"><IconCheck className="h-6 w-6 text-[var(--color-success)]" /><p className="text-sm">Nenhuma pendência nos indicadores disponíveis.</p></div>}
          {unavailable.length ? <p className="border-t border-[var(--color-border)] px-5 py-3 text-xs text-[var(--color-ink-muted)]">Indicadores indisponíveis: {unavailable.map((item) => item.label).join(", ")}.</p> : null}
        </section>
        <section className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="border-b border-[var(--color-border)] p-5"><p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--color-primary)]">Seu espaço de operação</p><h2 className="font-bold">Acesso rápido</h2></div>
          <div className="p-2">{[
            { href: "/organizations", title: "Gerenciar organizações", description: "Contas, acesso e período de teste", icon: IconBuilding },
            { href: "/users", title: "Consultar usuários", description: "Titulares, vínculos e permissões", icon: IconUsers },
            { href: "/referrals", title: "Parceiros e indicações", description: "Cupons, comissões e parceiros", icon: IconGift },
            { href: "/feedbacks", title: "Atender feedbacks", description: "Analisar e acompanhar solicitações", icon: IconMessage },
          ].map(({ href, title, description, icon: Icon }) => <Link key={href} href={href} className="flex items-center gap-3 rounded-[var(--radius-md)] p-3 hover:bg-[var(--color-surface-subtle)]"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--color-border)] text-[var(--color-primary)]"><Icon className="h-[18px] w-[18px]" /></span><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs text-[var(--color-ink-muted)]">{description}</p></div><IconChevronRight className="h-4 w-4 shrink-0 text-[var(--color-ink-muted)]" /></Link>)}</div>
          <div className="m-4 mt-1 rounded-[var(--radius-md)] bg-[var(--color-primary-subtle)] p-4"><p className="text-xs font-semibold text-[var(--color-primary)]">Encontre uma conta em qualquer tela</p><p className="mt-1.5 text-xs leading-relaxed text-[var(--color-ink-muted)]">Use a busca no topo pelo nome da organização ou do titular. No teclado, pressione /.</p></div>
        </section>
      </div>

      <div className="flex items-end justify-between gap-3 pt-2"><div><h2 className="text-lg font-bold">A plataforma em números</h2><p className="mt-1 text-xs text-[var(--color-ink-muted)]">Detalhamento dos indicadores de operação.</p></div></div>
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <DetailPanel title="Contas e cadastros" description="Organizações e novos profissionais" href="/organizations" items={[
          { label: "Cadastros em 24 horas", value: data.registrations_last_24_hours },
          { label: "Cadastros em 7 dias", value: data.registrations_last_7_days },
          { label: "Organizações ativas", value: data.organizations_active },
          { label: "Organizações em avaliação", value: data.organizations_evaluating },
          { label: "Organizações suspensas", value: data.organizations_suspended },
        ]} />
        <DetailPanel title="Uso do produto" description="Volume de operação registrado" href="/cycle-agenda" items={[
          { label: "Clientes ativos", value: data.clients_active_total },
          { label: "Ciclos", value: data.cycles_total },
          { label: "Compromissos", value: data.appointments_scheduled_total },
          { label: "Recebíveis", value: data.receivables_total },
        ]} />
        <DetailPanel title="Assistente IA" description="Conversas e propostas registradas" href="/ai" items={[
          { label: "Conversas", value: data.assistant_threads_total },
          { label: "Propostas geradas", value: data.ai_proposals_generated },
          { label: "Propostas confirmadas", value: data.ai_proposals_confirmed },
          { label: "Falhas em 7 dias", value: data.ai_failures_recent },
        ]} />
      </div>
      <details className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-5">
        <summary className="cursor-pointer py-4 text-sm font-semibold">Todos os indicadores de atenção</summary>
        <dl className="grid gap-x-8 pb-4 sm:grid-cols-2">{attention.map((item) => <div key={item.label} className="flex justify-between gap-3 border-t border-[var(--color-border)] py-3 text-xs"><dt>{item.label}</dt><dd className="font-semibold tabular-nums">{formatCount(item.value)}</dd></div>)}</dl>
      </details>
      <p className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-ink-muted)]"><IconClock className="h-3.5 w-3.5" />Atualizado em {formatAdminDate(data.generated_at)} · Horário de Brasília</p>
    </> : null}
    {!loading && !error && !data ? <p role="status" className="text-sm text-[var(--color-ink-muted)]">Sem dados disponíveis.</p> : null}
  </div>;
}
