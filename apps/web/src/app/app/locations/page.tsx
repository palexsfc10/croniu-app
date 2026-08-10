"use client";

import { BackLink } from "@/components/app/back-link";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch, type Location } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { TextField } from "@/components/ui/text-field";

export default function LocationsPage() {
  const [items, setItems] = useState<Location[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load(search: string) {
    setLoading(true);
    const params = new URLSearchParams({ status: "active" });
    if (search.trim()) params.set("q", search.trim());
    const result = await apiFetch<Location[]>(`/api/v1/locations?${params}`);
    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setItems(result.data ?? []);
    setError(null);
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const params = new URLSearchParams({ status: "active" });
      const result = await apiFetch<Location[]>(`/api/v1/locations?${params}`);
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
      <BackLink href="/app/profile" label="Mais" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="h-display text-3xl text-[var(--color-ink)]">Locais</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">Onde você atende.</p>
        </div>
        <Link href="/app/locations/new">
          <Button>Novo</Button>
        </Link>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void load(q);
        }}
      >
        <div className="flex-1">
          <TextField label="Buscar" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button type="submit" variant="secondary" className="mt-7">
          Buscar
        </Button>
      </form>
      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
      {loading ? <p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p> : null}
      {!loading && !items.length ? (
        <EmptyState title="Nenhum local" description="Cadastre academias, parques ou Online." />
      ) : null}
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={`/app/locations/${item.id}`}
              className="block rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3"
            >
              <p className="font-semibold text-[var(--color-ink)]">{item.name}</p>
              <p className="text-sm text-[var(--color-ink-muted)]">
                {item.address || item.meeting_url || "Sem endereço"}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
