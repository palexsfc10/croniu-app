"use client";

import { BackLink } from "@/components/app/back-link";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch, type Client, type ProfessionProfile } from "@/lib/api";
import { nomenclatureFor } from "@/lib/nomenclature";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function ClientsPage() {
  const [items, setItems] = useState<Client[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [profession, setProfession] = useState<ProfessionProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const terms = nomenclatureFor(profession?.profession_code);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [result, prof] = await Promise.all([
        apiFetch<Client[]>("/api/v1/clients"),
        apiFetch<ProfessionProfile>("/api/v1/organization/profession"),
      ]);
      if (cancelled) return;
      if (result.error) setError(result.error.message);
      else setItems(result.data ?? []);
      if (prof.data) setProfession(prof.data);
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
          <h1 className="h-display text-3xl text-[var(--color-ink)]">
            {terms.clients.charAt(0).toUpperCase() + terms.clients.slice(1)}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">Pessoas que você atende.</p>
        </div>
        <div className="flex flex-col items-end gap-2 sm:flex-row">
          <Link href="/app/clients/intake">
            <Button variant="secondary">{terms.new_intake}</Button>
          </Link>
          <Link href="/app/clients/new">
            <Button>Novo</Button>
          </Link>
        </div>
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
              className="block rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3 transition-colors hover:bg-[var(--color-primary-subtle)]/40"
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
