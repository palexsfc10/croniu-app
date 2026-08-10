"use client";

import { useEffect, useState } from "react";
import { apiFetch, type Paginated, type UserListItem } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";

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
        className="flex flex-col gap-2 sm:flex-row"
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
        <div className="flex items-end">
          <Button type="submit">Buscar</Button>
        </div>
      </form>

      {loading ? <p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p> : null}
      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
      {!loading && data && data.items.length === 0 ? (
        <p className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] p-4 text-sm text-[var(--color-ink-muted)]">
          Nenhum usuário encontrado.
        </p>
      ) : null}

      {data && data.items.length > 0 ? (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--color-border)] text-xs uppercase text-[var(--color-ink-muted)]">
              <tr>
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">E-mail</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Organização</th>
                <th className="px-3 py-2">Papéis plataforma</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((user) => (
                <tr key={user.id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-3 py-3 font-medium">{user.full_name}</td>
                  <td className="px-3 py-3">{user.email_masked}</td>
                  <td className="px-3 py-3">{user.account_status}</td>
                  <td className="px-3 py-3">
                    {user.organization_name ?? "—"}
                    {user.organization_role ? (
                      <span className="block text-xs text-[var(--color-ink-muted)]">
                        {user.organization_role}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    {user.platform_roles.length > 0 ? user.platform_roles.join(", ") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {data && data.total > data.page_size ? (
        <div className="flex items-center gap-3">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </Button>
          <p className="text-sm text-[var(--color-ink-muted)]">
            Página {data.page} · {data.total} no total
          </p>
          <Button
            variant="secondary"
            disabled={page * data.page_size >= data.total}
            onClick={() => setPage((p) => p + 1)}
          >
            Próxima
          </Button>
        </div>
      ) : null}
    </div>
  );
}
