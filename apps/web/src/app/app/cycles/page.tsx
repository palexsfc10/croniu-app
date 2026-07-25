"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch, type Cycle } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function CyclesPage() {
  const [items, setItems] = useState<Cycle[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await apiFetch<Cycle[]>("/api/v1/cycles");
      if (cancelled) return;
      if (result.error) setError(result.error.message);
      else setItems(result.data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-4 animate-fade-up">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="h-display text-3xl text-[var(--color-ink)]">Ciclos</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">Pacotes e períodos contratados.</p>
        </div>
        <Link href="/app/cycles/new">
          <Button>Novo</Button>
        </Link>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
      {!items.length ? (
        <EmptyState title="Nenhum ciclo" description="Crie um ciclo a partir de um cliente e serviço." />
      ) : null}
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={`/app/cycles/${item.id}`}
              className="block rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3"
            >
              <p className="font-semibold">{item.client_name}</p>
              <p className="text-sm text-[var(--color-ink-muted)]">
                {item.service_name} · {item.starts_on} → {item.ends_on}
                {item.is_nearing_end ? " · encerrando" : ""}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
