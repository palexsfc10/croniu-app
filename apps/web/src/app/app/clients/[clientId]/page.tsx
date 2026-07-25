"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch, type Client } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ContextualBar } from "@/components/app/contextual-bar";

export default function ClientDetailPage() {
  const params = useParams<{ clientId: string }>();
  const router = useRouter();
  const [item, setItem] = useState<Client | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await apiFetch<Client>(`/api/v1/clients/${params.clientId}`);
      if (cancelled) return;
      if (result.error) setError(result.error.message);
      else setItem(result.data ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [params.clientId]);

  async function archive() {
    if (!item) return;
    const result = await apiFetch<Client>(`/api/v1/clients/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "archived" }),
    });
    if (result.error) {
      setError(result.error.message);
      return;
    }
    router.replace("/app/clients");
  }

  return (
    <div className="space-y-4 animate-fade-up">
      <ContextualBar label={item ? `Cliente · ${item.full_name}` : null} />
      <Link href="/app/clients" className="text-sm font-semibold text-[var(--color-ink-muted)]">
        Voltar
      </Link>
      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
      {item ? (
        <>
          <h1 className="h-display text-3xl text-[var(--color-ink)]">{item.full_name}</h1>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-[var(--color-ink-muted)]">Telefone</dt>
              <dd>{item.phone || "—"}</dd>
            </div>
            <div>
              <dt className="text-[var(--color-ink-muted)]">E-mail</dt>
              <dd>{item.email || "—"}</dd>
            </div>
            <div>
              <dt className="text-[var(--color-ink-muted)]">Observações</dt>
              <dd>{item.notes || "—"}</dd>
            </div>
          </dl>
          <Link href={`/app/cycles/new?clientId=${item.id}`}>
            <Button fullWidth>Criar ciclo</Button>
          </Link>
          {item.status === "active" ? (
            <Button variant="secondary" fullWidth onClick={() => void archive()}>
              Arquivar cliente
            </Button>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p>
      )}
    </div>
  );
}
