"use client";

import { Suspense } from "react";
import Link from "next/link";
import type { OrganizationListItem } from "@/lib/api";
import { useDirectory } from "@/lib/use-directory";
import { formatAdminDate, formatCount, initials, statusLabel } from "@/lib/presentation";
import { statusTone } from "@/lib/status-tone";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, THead, Th, TBody, Tr, Td, TableSkeleton } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { ResourceError } from "@/components/ui/resource-error";
import { DirectorySearch, DirectoryPagination } from "@/components/directory-controls";
import { IconBuilding, IconChevronRight } from "@/components/ui/icons";

function OrganizationStatus({ org }: { org: OrganizationListItem }) {
  return <div className="flex flex-wrap gap-1.5"><Badge tone={statusTone(org.status)}>Conta: {statusLabel(org.status)}</Badge>{org.subscription_status ? <Badge tone={statusTone(org.subscription_status)}>Assinatura: {statusLabel(org.subscription_status)}</Badge> : org.plan_code ? <Badge>{org.plan_code}</Badge> : null}{org.operational_status && org.operational_status !== org.status && org.operational_status !== org.subscription_status ? <Badge tone={statusTone(org.operational_status)}>{statusLabel(org.operational_status)}</Badge> : null}</div>;
}

function LastAccess({ org }: { org: OrganizationListItem }) {
  return <div className="text-xs"><p>{formatAdminDate(org.last_login_at ?? org.last_activity_at)}</p>{org.last_login_at || org.last_activity_at ? <p className="mt-1 text-[var(--color-ink-muted)]">{org.last_login_at ? "Login confirmado" : "Atividade registrada"}</p> : null}</div>;
}

function OrganizationsDirectory() {
  const { data, error, loading, refresh, query, page, size, navigate } = useDirectory<OrganizationListItem>("/organizations");
  return <div className="space-y-6">
    <PageHeader title="Organizações" description="Encontre uma conta e consulte acesso, assinatura e uso. Abra os detalhes para gerenciar." eyebrow="Gestão de contas" actions={<Button variant="secondary" disabled={loading} onClick={refresh}>Atualizar</Button>} />
    <DirectorySearch query={query} placeholder="Nome da organização ou titular (mín. 2 caracteres)" submit={(search) => navigate({ search })} />
    {error ? <ResourceError message={error} retry={refresh} /> : null}
    {loading ? <div role="status" aria-label="Carregando organizações"><TableSkeleton columns={5} /></div> : null}
    {data ? <>
      <div className="flex flex-wrap items-center justify-between gap-2"><p aria-live="polite" className="text-sm"><strong>{formatCount(data.total)}</strong> <span className="text-[var(--color-ink-muted)]">{query ? `resultados para “${query}”` : "organizações cadastradas"}</span></p><p className="text-xs text-[var(--color-ink-muted)]">Datas no horário de Brasília</p></div>
      {data.items.length === 0 ? <EmptyState icon={<IconBuilding className="h-8 w-8" />} title="Nenhuma organização encontrada" description={query ? "Tente outro nome ou limpe a busca para ver todas as contas." : "As organizações aparecerão aqui após o cadastro."} /> : <>
        <div className="hidden lg:block"><Table><THead><Th>Organização / titular</Th><Th>Situação da conta</Th><Th>Uso do produto</Th><Th>Último acesso</Th><Th><span className="sr-only">Ações</span></Th></THead><TBody>{data.items.map((org) => <Tr key={org.id}>
          <Td><div className="flex items-start gap-3"><span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] text-xs font-bold text-[var(--color-primary)]">{initials(org.name)}</span><div className="min-w-0"><Link href={`/organizations/${org.id}`} className="font-semibold text-[var(--color-ink)] hover:text-[var(--color-primary)] hover:underline">{org.name}</Link><p className="mt-1 text-xs text-[var(--color-ink-muted)]">{org.owner_name ?? "Titular não informado"}</p><p className="mt-0.5 text-xs text-[var(--color-ink-muted)]">{org.owner_email_masked}</p></div></div></Td>
          <Td><OrganizationStatus org={org} /></Td>
          <Td><p className="text-xs"><strong className="tabular-nums">{formatCount(org.clients_count)}</strong> clientes · <strong className="tabular-nums">{formatCount(org.cycles_count)}</strong> ciclos</p><p className="mt-1.5 text-xs text-[var(--color-ink-muted)]">{formatCount(org.appointments_count)} na agenda · {formatCount(org.assistant_threads_count)} conversas IA</p></Td>
          <Td><LastAccess org={org} /></Td>
          <Td><Link aria-label={`Gerenciar ${org.name}`} href={`/organizations/${org.id}`} className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-[var(--color-primary)]">Gerenciar<IconChevronRight className="h-4 w-4" /></Link></Td>
        </Tr>)}</TBody></Table></div>
        <ul className="space-y-3 lg:hidden">{data.items.map((org) => <li key={org.id} className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-white p-4">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><Link href={`/organizations/${org.id}`} className="font-bold text-[var(--color-primary)]">{org.name}</Link><p className="mt-1 text-xs text-[var(--color-ink-muted)]">{org.owner_name ?? "Titular não informado"}</p><p className="mt-1 text-xs text-[var(--color-ink-muted)]">{org.owner_email_masked}</p></div><IconBuilding className="h-5 w-5 shrink-0 text-[var(--color-ink-muted)]" /></div>
          <div className="my-4"><OrganizationStatus org={org} /></div>
          <dl className="grid grid-cols-2 gap-3 rounded-lg bg-[var(--color-surface-subtle)] p-3 text-xs">{[["Clientes", org.clients_count], ["Ciclos", org.cycles_count], ["Agenda", org.appointments_count], ["Conversas IA", org.assistant_threads_count]].map(([label, value]) => <div key={String(label)}><dt className="text-[var(--color-ink-muted)]">{label}</dt><dd className="mt-1 font-semibold">{formatCount(value as number | undefined)}</dd></div>)}</dl>
          <div className="mt-3 flex items-center justify-between gap-2"><LastAccess org={org} /><Link href={`/organizations/${org.id}`} aria-label={`Gerenciar ${org.name}`} className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-[var(--color-primary)]">Gerenciar<IconChevronRight className="h-4 w-4" /></Link></div>
        </li>)}</ul>
      </>}
      <DirectoryPagination page={page} size={size} total={data.total} loading={loading} navigate={navigate} />
    </> : null}
  </div>;
}

export default function OrganizationsPage() {
  return <Suspense fallback={<TableSkeleton columns={5} />}><OrganizationsDirectory /></Suspense>;
}
