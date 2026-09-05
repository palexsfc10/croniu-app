"use client";

import { useEffect, useState } from "react";
import { apiFetch, type Paginated, type UserListItem } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { Badge } from "@/components/ui/badge";
import { Table, THead, Th, TBody, Tr, Td, TableSkeleton } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { IconChevronLeft, IconChevronRight, IconSearch, IconUsers } from "@/components/ui/icons";
import { statusTone } from "@/lib/status-tone";

export default function UsersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<Paginated<UserListItem> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), page_size: "20" });
      if (query.trim().length >= 2) params.set("search", query.trim());
      const result = await apiFetch<Paginated<UserListItem>>(
        `/api/v1/platform/users?${params.toString()}`,
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
        <h1 className="h-display text-3xl">Usuários</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          E-mails mascarados na listagem. Sem senhas ou tokens.
        </p>
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

      {loading ? <TableSkeleton columns={5} /> : null}

      {!loading && data && data.items.length === 0 ? (
        <EmptyState icon={<IconUsers className="h-8 w-8" />} title="Nenhum usuário encontrado" />
      ) : null}

      {!loading && data && data.items.length > 0 ? (
        <Table>
          <THead>
            <Th>Nome</Th>
            <Th>E-mail</Th>
            <Th>Status</Th>
            <Th>Organização</Th>
            <Th>Papéis plataforma</Th>
          </THead>
          <TBody>
            {data.items.map((user) => (
              <Tr key={user.id}>
                <Td className="font-medium">{user.full_name}</Td>
                <Td>{user.email_masked}</Td>
                <Td>
                  <Badge tone={statusTone(user.account_status)}>{user.account_status}</Badge>
                </Td>
                <Td>
                  {user.organization_name ?? "—"}
                  {user.organization_role ? (
                    <span className="block text-xs text-[var(--color-ink-muted)]">
                      {user.organization_role}
                    </span>
                  ) : null}
                </Td>
                <Td>{user.platform_roles.length > 0 ? user.platform_roles.join(", ") : "—"}</Td>
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
