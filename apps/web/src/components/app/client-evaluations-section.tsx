"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, type ClientEvaluation } from "@/lib/api";
import { Button } from "@/components/ui/button";

const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  published: "Publicada",
};

type Props = {
  clientId: string;
};

export function ClientEvaluationsSection({ clientId }: Props) {
  const [items, setItems] = useState<ClientEvaluation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await apiFetch<ClientEvaluation[]>(
        `/api/v1/clients/${clientId}/evaluations`,
      );
      if (cancelled) return;
      if (result.error) {
        setError(result.error.message);
        setLoading(false);
        return;
      }
      setError(null);
      setItems(result.data ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId]);
  return (
    <section
      aria-label="Evolução do cliente"
      className="space-y-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Evolução</h2>
          <p className="text-sm text-[var(--color-ink-muted)]">
            Avaliações periódicas. Só o que você publicar aparece no portal do cliente.
          </p>
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-[var(--color-ink-muted)]">Nenhuma avaliação ainda.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/app/clients/${clientId}/evaluations/${item.id}`}
                className="block rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-[var(--color-ink)]">{item.title}</p>
                  <span
                    className={[
                      "shrink-0 rounded px-2 py-0.5 text-xs font-semibold",
                      item.status === "published"
                        ? "bg-[var(--color-surface-muted)] text-[var(--color-primary)]"
                        : "bg-[var(--color-bg)] text-[var(--color-ink-muted)]",
                    ].join(" ")}
                  >
                    {STATUS_LABEL[item.status] ?? item.status}
                  </span>
                </div>
                {item.summary ? (
                  <p className="mt-1 line-clamp-2 text-sm text-[var(--color-ink-muted)]">
                    {item.summary}
                  </p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link href={`/app/clients/${clientId}/evaluations/new`} className="block">
        <Button fullWidth variant="secondary">
          Nova avaliação
        </Button>
      </Link>
    </section>
  );
}
