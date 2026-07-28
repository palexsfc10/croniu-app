"use client";

import { BackLink } from "@/components/app/back-link";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch, type Client } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function ClientsPage() {
  const [items, setItems] = useState<Client[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await apiFetch<Client[]>("/api/v1/clients");
      if (cancelled) return;
      if (result.error) setError(result.error.message);
      else setItems(result.data ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-4 animate-fade-up">
      <BackLink href="/app" label="Hoje" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="h-display text-3xl text-[var(--color-ink)]">Clientes</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">Pessoas que você atende.</p>
        </div>
        <Link href="/app/clients/new">
          <Button>Novo</Button>
        </Link>
      </div>
      {loading ? <p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p> : null}
      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
      {!loading && !items.length ? (
        <EmptyState title="Nenhum cliente" description="Cadastre o primeiro cliente para criar ciclos." />
      ) : null}
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={`/app/clients/${item.id}`}
              className="block rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3"
            >
              <p className="font-semibold">{item.full_name}</p>
              <p className="text-sm text-[var(--color-ink-muted)]">
                {item.phone || item.email || "Sem contato"}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
