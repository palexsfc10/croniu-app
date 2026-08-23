"use client";

import { useEffect, useState } from "react";
import { apiFetch, type HomeSummary } from "@/lib/api";
import { TodayBoard } from "@/components/app/today-board";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

export default function AppHomePage() {
  const [summary, setSummary] = useState<HomeSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const result = await apiFetch<HomeSummary>("/api/v1/home/summary");
      if (cancelled) return;
      if (result.error) {
        setError(result.error.message);
      } else {
        setError(null);
        setSummary(result.data ?? null);
      }
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  if (loading) {
    return <p className="text-sm text-[var(--color-ink-muted)]">Carregando painel…</p>;
  }

  if (error) {
    return (
      <EmptyState
        title="Não foi possível carregar seu painel"
        description={error}
        action={
          <Button
            type="button"
            onClick={() => {
              setLoading(true);
              setReloadKey((k) => k + 1);
            }}
          >
            Tentar novamente
          </Button>
        }
      />
    );
  }

  if (!summary) {
    // Genuinely unexpected (a healthy response with no body) — a blank
    // screen here would look like the app crashed, with no way forward.
    return (
      <EmptyState
        title="Painel indisponível no momento"
        description="Não recebemos os dados do seu painel. Tente novamente em instantes."
        action={
          <Button
            type="button"
            onClick={() => {
              setLoading(true);
              setReloadKey((k) => k + 1);
            }}
          >
            Tentar novamente
          </Button>
        }
      />
    );
  }

  return <TodayBoard summary={summary} />;
}
