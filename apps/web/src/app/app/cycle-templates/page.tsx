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
      "Arquivar este modelo? Ele sai da lista de modelos disponíveis; ciclos já criados com ele não mudam.",
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
        <div className="min-w-0">
          <h1 className="h-display text-3xl text-[var(--color-ink)]">Modelos de ciclo</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            Estrutura reutilizável: com que frequência e por quanto tempo. O valor vem do{" "}
            <Link href="/app/services" className="font-medium text-[var(--color-link)] hover:underline">
              serviço
            </Link>{" "}
            e os dias da semana você escolhe no{" "}
            <Link href="/app/cycles" className="font-medium text-[var(--color-link)] hover:underline">
              ciclo do cliente
            </Link>
            .
          </p>
        </div>
        <Link href="/app/cycle-templates/new" className="shrink-0">
          <Button className="whitespace-nowrap">Novo modelo</Button>
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
            <div className="mt-3 flex items-center justify-between gap-2">
              <Link href={`/app/cycle-templates/${item.id}`}>
                <Button variant="secondary" size="sm">
                  Editar
                </Button>
              </Link>
              <Button
                variant="ghost"
                size="sm"
                className="text-[var(--color-ink-muted)]"
                disabled={busyId === item.id}
                onClick={() => void removeTemplate(item.id)}
              >
                {busyId === item.id ? "…" : "Arquivar"}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
