"use client";

import { BackLink } from "@/components/app/back-link";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch, type CycleTemplate } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function CycleTemplatesPage() {
  const router = useRouter();
  const [items, setItems] = useState<CycleTemplate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const result = await apiFetch<CycleTemplate[]>("/api/v1/cycle-templates?status=active");
    if (result.error) setError(result.error.message);
    else {
      setError(null);
      setItems(result.data ?? []);
    }
  }

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

  async function removeTemplate(id: string) {
    const ok = window.confirm(
      "Excluir este modelo? Ele some da lista; ciclos já criados não mudam.",
    );
    if (!ok) return;
    setBusyId(id);
    setError(null);
    const result = await apiFetch<CycleTemplate>(`/api/v1/cycle-templates/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "archived" }),
    });
    setBusyId(null);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    await load();
  }

  return (
    <div className="space-y-4 animate-fade-up">
      <BackLink href="/app/profile" label="Mais" />
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
            <button
              type="button"
              className="w-full text-left"
              onClick={() => router.push(`/app/cycle-templates/${item.id}`)}
            >
              <p className="font-semibold text-[var(--color-ink)]">{item.name}</p>
              <p className="text-sm text-[var(--color-ink-muted)]">
                {item.weekly_frequency}x / semana · {item.duration_label}
              </p>
            </button>
            <div className="mt-3 flex gap-2">
              <Link href={`/app/cycle-templates/${item.id}`} className="min-w-0 flex-1">
                <Button fullWidth className="min-h-10">
                  Editar
                </Button>
              </Link>
              <Button
                fullWidth
                className="min-h-10 flex-1"
                disabled={busyId === item.id}
                onClick={() => void removeTemplate(item.id)}
              >
                {busyId === item.id ? "…" : "Excluir"}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
