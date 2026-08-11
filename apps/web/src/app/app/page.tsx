"use client";

import { useEffect, useState } from "react";
import { apiFetch, type HomeSummary } from "@/lib/api";
import { TodayBoard } from "@/components/app/today-board";

export default function AppHomePage() {
  const [summary, setSummary] = useState<HomeSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const result = await apiFetch<HomeSummary>("/api/v1/home/summary");
      if (cancelled) return;
      if (result.error) {
        setError(result.error.message);
      } else {
        setSummary(result.data ?? null);
      }
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <p className="text-sm text-[var(--color-ink-muted)]">Carregando painel…</p>;
  }

  if (error) {
    return (
      <p role="alert" className="text-sm text-[var(--color-danger)]">
        {error}
      </p>
    );
  }

  if (!summary) {
    return null;
  }

  return <TodayBoard summary={summary} />;
}
