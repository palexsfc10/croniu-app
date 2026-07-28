"use client";

import { BackLink } from "@/components/app/back-link";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch, formatBRL, formatDateBR, type Cycle } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function CyclesPage() {
  const router = useRouter();
  const [items, setItems] = useState<Cycle[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const result = await apiFetch<Cycle[]>("/api/v1/cycles");
    if (result.error) setError(result.error.message);
    else {
      setError(null);
      setItems(result.data ?? []);
    }
  }

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

  async function removeCycle(id: string) {
    const ok = window.confirm(
      "Excluir este ciclo? Ele será cancelado; aulas agendadas e recebimentos em aberto também.",
    );
    if (!ok) return;
    setBusyId(id);
    setError(null);
    const result = await apiFetch<Cycle>(`/api/v1/cycles/${id}/cancel`, { method: "POST" });
    setBusyId(null);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    await load();
  }

  return (
    <div className="space-y-4 animate-fade-up">
      <BackLink href="/app" label="Hoje" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="h-display text-3xl text-[var(--color-ink)]">Ciclos</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">Contratos e períodos de aula.</p>
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
        <EmptyState
          title="Nenhum ciclo"
          description="Crie um ciclo a partir de cliente, serviço e modelo."
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
              onClick={() => router.push(`/app/cycles/${item.id}`)}
            >
              <p className="font-semibold text-[var(--color-ink)]">{item.client_name}</p>
              <p className="text-sm text-[var(--color-ink-muted)]">
                {item.service_name} · {formatDateBR(item.starts_on)} → {formatDateBR(item.ends_on)}
              </p>
              <p className="mt-1 text-sm text-[var(--color-ink)]">
                {item.lesson_count != null
                  ? `${item.lessons_completed ?? 0}/${item.lesson_count} aulas · `
                  : ""}
                {formatBRL(item.value_cents)}
                {item.status !== "active" ? ` · ${item.status}` : ""}
                {item.is_legacy ? " · legado" : ""}
                {item.is_nearing_end ? " · encerrando" : ""}
              </p>
            </button>
            {item.status !== "cancelled" ? (
              <div className="mt-3 flex gap-2">
                <Link href={`/app/cycles/${item.id}/edit`} className="min-w-0 flex-1">
                  <Button fullWidth className="min-h-10">
                    Editar
                  </Button>
                </Link>
                <Button
                  fullWidth
                  className="min-h-10 flex-1"
                  disabled={busyId === item.id}
                  onClick={() => void removeCycle(item.id)}
                >
                  {busyId === item.id ? "…" : "Excluir"}
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
