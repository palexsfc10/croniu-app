"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch, type OrganizationListItem, type Paginated } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { Badge } from "@/components/ui/badge";
import { Table, THead, Th, TBody, Tr, Td, TableSkeleton } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { IconBuilding, IconChevronLeft, IconChevronRight, IconSearch } from "@/components/ui/icons";
import { statusTone } from "@/lib/status-tone";

export default function OrganizationsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<Paginated<OrganizationListItem> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const params = new URLSearchParams({
        page: String(page),
        page_size: "20",
      });
      if (query.trim().length >= 2) params.set("search", query.trim());
      const result = await apiFetch<Paginated<OrganizationListItem>>(
        `/api/v1/platform/organizations?${params.toString()}`,
      );
      if (cancelled) return;
      if (result.error) setError(result.error.message);
      else {
        setError(null);
        setData(result.data ?? null);
      }
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [page, query]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="h-display text-3xl">Organizações</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">Listagem operacional paginada.</p>
      </div>
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setQuery(search);
        }}
      >
        <div className="flex-1">
          <TextField
            label="Pesquisar"
            name="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nome ou proprietário (mín. 2 caracteres)"
          />
        </div>
        <Button type="submit">
          <IconSearch className="h-4 w-4" /> Buscar
        </Button>
      </form>

      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}

      {loading ? <TableSkeleton columns={6} /> : null}

      {!loading && !error && data && data.items.length === 0 ? (
        <EmptyState
          icon={<IconBuilding className="h-8 w-8" />}
          title="Nenhuma organização encontrada"
          description={
            query
              ? `Nenhum resultado para "${query}". Ajuste o termo de busca.`
              : "Ainda não há organizações cadastradas."
          }
        />
      ) : null}

      {!loading && data && data.items.length > 0 ? (
        <Table>
          <THead>
            <Th>Nome</Th>
            <Th>Profissional</Th>
            <Th>Status</Th>
            <Th>Clientes / Ciclos / Agenda</Th>
            <Th>IA</Th>
            <Th>Último acesso</Th>
          </THead>
          <TBody>
            {data.items.map((org) => (
              <Tr key={org.id}>
                <Td>
                  <Link
                    className="font-semibold text-[var(--color-primary)] underline-offset-2 hover:underline"
                    href={`/organizations/${org.id}`}
                  >
                    {org.name}
                  </Link>
                </Td>
                <Td>
                  <div>{org.owner_name ?? "—"}</div>
                  <div className="text-xs text-[var(--color-ink-muted)]">{org.owner_email_masked}</div>
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    <Badge tone={statusTone(org.operational_status ?? org.status)}>
                      {org.operational_status ?? org.status}
                    </Badge>
                    {org.subscription_status || org.plan_code ? (
                      <Badge tone={statusTone(org.subscription_status)}>
                        {org.subscription_status ?? org.plan_code}
                      </Badge>
                    ) : null}
                  </div>
                </Td>
                <Td className="tabular-nums">
                  {org.clients_count} / {org.cycles_count} / {org.appointments_count ?? 0}
                </Td>
                <Td className="tabular-nums">{org.assistant_threads_count ?? 0}</Td>
                <Td>
                  {org.last_login_at ? (
                    <span title="Último login confirmado">Login: {new Date(org.last_login_at).toLocaleString("pt-BR")}</span>
                  ) : org.last_activity_at ? (
                    <span title="Última atividade registrada (não necessariamente um login)">
                      Atividade: {new Date(org.last_activity_at).toLocaleDateString("pt-BR")}
                    </span>
                  ) : (
                    <span className="text-[var(--color-ink-muted)]">—</span>
                  )}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      ) : null}

      {data && data.total > data.page_size ? (
        <div className="flex items-center gap-3">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            <IconChevronLeft className="h-4 w-4" /> Anterior
          </Button>
          <p className="text-sm text-[var(--color-ink-muted)]">
            Página {data.page} · {data.total} no total
          </p>
          <Button
            variant="secondary"
            size="sm"
            disabled={page * data.page_size >= data.total}
            onClick={() => setPage((p) => p + 1)}
          >
            Próxima <IconChevronRight className="h-4 w-4" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
