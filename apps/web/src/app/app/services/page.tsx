"use client";

import { BackLink } from "@/components/app/back-link";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch, formatBRL, type Service } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function ServicesPage() {
  const [items, setItems] = useState<Service[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await apiFetch<Service[]>("/api/v1/services?status=active");
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
      <BackLink href="/app/profile" label="Mais" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="h-display text-3xl text-[var(--color-ink)]">Serviços</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">O que você oferece e o valor por aula.</p>
        </div>
        <Link href="/app/services/new">
          <Button>Novo</Button>
        </Link>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
      {!items.length ? (
        <EmptyState title="Nenhum serviço" description="Cadastre um serviço antes de criar ciclos." />
      ) : null}
      <ul className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0 xl:grid-cols-3">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={`/app/services/${item.id}`}
              className="block h-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3"
            >
              <p className="font-semibold text-[var(--color-ink)]">{item.name}</p>
              <p className="text-sm text-[var(--color-ink-muted)]">
                {item.pricing_mode === "fixed_period"
                  ? `${formatBRL(item.fixed_price_cents)} / plano`
                  : `${formatBRL(item.default_price_cents)} / aula`}{" "}
                · {item.default_duration_minutes} min
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
