"use client";

import { useEffect, useState } from "react";
import { apiFetch, type HomeSummary } from "@/lib/api";
import { TodayBoard } from "@/components/app/today-board";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

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
    return (
      <div className="space-y-5 md:space-y-6" role="status" aria-label="Carregando painel">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
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
