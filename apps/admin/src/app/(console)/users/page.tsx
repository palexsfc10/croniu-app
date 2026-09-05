"use client";

import { Suspense } from "react";
import Link from "next/link";
import type { UserListItem } from "@/lib/api";
import { useDirectory } from "@/lib/use-directory";
import { formatCount, initials, statusLabel } from "@/lib/presentation";
import { statusTone } from "@/lib/status-tone";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, Th, TBody, Tr, Td, TableSkeleton } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { ResourceError } from "@/components/ui/resource-error";
import { DirectorySearch, DirectoryPagination } from "@/components/directory-controls";
import { IconUsers } from "@/components/ui/icons";

function OrganizationLink({ user }: { user: UserListItem }) {
  return <div>{user.organization_id ? <Link href={`/organizations/${user.organization_id}`} className="font-semibold text-[var(--color-primary)] hover:underline">{user.organization_name ?? "Abrir organização"}</Link> : <span className="text-[var(--color-ink-muted)]">Sem organização</span>}{user.organization_role ? <p className="mt-1 text-xs text-[var(--color-ink-muted)]">{statusLabel(user.organization_role)}</p> : null}</div>;
}

function UsersDirectory() {
  const { data, error, loading, refresh, query, page, size, navigate } = useDirectory<UserListItem>("/users");
  return <div className="space-y-6">
    <PageHeader title="Usuários" description="Consulte cadastros, vínculos e permissões. Acesse a organização para gerenciar a conta." eyebrow="Pessoas e acesso" actions={<Button variant="secondary" disabled={loading} onClick={refresh}>Atualizar</Button>} />
    <DirectorySearch query={query} placeholder="Nome ou e-mail do usuário (mín. 2 caracteres)" submit={(search) => navigate({ search })} />
    {error ? <ResourceError message={error} retry={refresh} /> : null}
    {loading ? <div role="status" aria-label="Carregando usuários"><TableSkeleton columns={4} /></div> : null}
    {data ? <>
      <p aria-live="polite" className="text-sm"><strong>{formatCount(data.total)}</strong> <span className="text-[var(--color-ink-muted)]">{query ? `resultados para “${query}”` : "usuários cadastrados"}</span></p>
      {data.items.length === 0 ? <EmptyState icon={<IconUsers className="h-8 w-8" />} title="Nenhum usuário encontrado" description="Tente outro termo de busca ou consulte a lista completa." /> : <>
        <div className="hidden lg:block"><Table><THead><Th>Usuário</Th><Th>Status</Th><Th>Organização</Th><Th>Acesso à plataforma</Th></THead><TBody>{data.items.map((user) => <Tr key={user.id}>
          <Td><div className="flex items-center gap-3"><span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-muted)] text-xs font-bold text-[var(--color-primary)]">{initials(user.full_name)}</span><div><p className="font-semibold">{user.full_name}</p><p className="mt-1 text-xs text-[var(--color-ink-muted)]">{user.email_masked}</p></div></div></Td>
          <Td><Badge tone={statusTone(user.account_status)}>{statusLabel(user.account_status)}</Badge><p className="mt-1 text-xs text-[var(--color-ink-muted)]">{user.email_verified ? "E-mail verificado" : "E-mail não verificado"}</p></Td>
          <Td><OrganizationLink user={user} /></Td>
          <Td className="text-xs">{user.platform_roles.length ? user.platform_roles.map(statusLabel).join(", ") : "Sem acesso administrativo"}</Td>
        </Tr>)}</TBody></Table></div>
        <ul className="space-y-3 lg:hidden">{data.items.map((user) => <li key={user.id} className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{user.full_name}</p><Badge tone={statusTone(user.account_status)}>{statusLabel(user.account_status)}</Badge></div><p className="text-xs text-[var(--color-ink-muted)]">{user.email_masked} · {user.email_verified ? "Verificado" : "Não verificado"}</p><div className="border-t border-[var(--color-border)] pt-3 text-sm"><OrganizationLink user={user} /></div><p className="text-xs text-[var(--color-ink-muted)]">{user.platform_roles.length ? user.platform_roles.map(statusLabel).join(", ") : "Sem acesso administrativo"}</p></li>)}</ul>
      </>}
      <DirectoryPagination page={page} size={size} total={data.total} loading={loading} navigate={navigate} />
    </> : null}
  </div>;
}

export default function UsersPage() {
  return <Suspense fallback={<TableSkeleton columns={4} />}><UsersDirectory /></Suspense>;
}
