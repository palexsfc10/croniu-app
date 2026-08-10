"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch, type OrganizationListItem, type Paginated } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";

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
            placeholder="Nome ou proprietário (mín. 2 caracteres)"
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
      {!loading && !error && data && data.items.length === 0 ? (
        <p className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] p-4 text-sm text-[var(--color-ink-muted)]">
          Nenhuma organização encontrada.
        </p>
      ) : null}

      {data && data.items.length > 0 ? (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--color-border)] text-xs uppercase text-[var(--color-ink-muted)]">
              <tr>
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">Profissional</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Clientes / Ciclos / Agenda</th>
                <th className="px-3 py-2">IA</th>
                <th className="px-3 py-2">Último acesso</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((org) => (
                <tr key={org.id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-3 py-3">
                    <Link className="font-semibold text-[var(--color-primary)] underline-offset-2 hover:underline" href={`/organizations/${org.id}`}>
                      {org.name}
                    </Link>
                  </td>
                  <td className="px-3 py-3">
                    <div>{org.owner_name ?? "—"}</div>
                    <div className="text-xs text-[var(--color-ink-muted)]">{org.owner_email_masked}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div>{org.operational_status ?? org.status}</div>
                    <div className="text-xs text-[var(--color-ink-muted)]">
                      {org.subscription_status ?? org.plan_code}
                    </div>
                  </td>
                  <td className="px-3 py-3 tabular-nums">
                    {org.clients_count} / {org.cycles_count} / {org.appointments_count ?? 0}
                  </td>
                  <td className="px-3 py-3 tabular-nums">{org.assistant_threads_count ?? 0}</td>
                  <td className="px-3 py-3">
                    {org.last_login_at
                      ? new Date(org.last_login_at).toLocaleString("pt-BR")
                      : org.last_activity_at
                        ? new Date(org.last_activity_at).toLocaleDateString("pt-BR")
                        : "—"}
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
