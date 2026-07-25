"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch, type CycleTemplate } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function CycleTemplatesPage() {
  const [items, setItems] = useState<CycleTemplate[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await apiFetch<CycleTemplate[]>("/api/v1/cycle-templates?status=active");
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
      <Link href="/app/profile" className="text-sm font-semibold text-[var(--color-ink-muted)]">
        ← Mais
      </Link>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="h-display text-3xl text-[var(--color-ink)]">Modelos de ciclo</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            Padrões reutilizáveis. Os dias da semana você escolhe no ciclo do cliente.
          </p>
        </div>
        <Link href="/app/cycle-templates/new">
          <Button>Novo</Button>
        </Link>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
      {!items.length ? (
        <EmptyState
          title="Nenhum modelo"
          description="Crie um modelo como “2x por semana — mensal”."
        />
      ) : null}
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3"
          >
            <p className="font-semibold text-[var(--color-ink)]">{item.name}</p>
            <p className="text-sm text-[var(--color-ink-muted)]">
              {item.weekly_frequency}x / semana · {item.duration_label}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
