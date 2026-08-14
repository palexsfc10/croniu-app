"use client";

import { useEffect, useState } from "react";
import { BackLink } from "@/components/app/back-link";
import { InitialSetupCard } from "@/components/app/initial-setup-card";
import { useAuth } from "@/components/auth/auth-provider";
import { apiFetch, type HomeSummary } from "@/lib/api";
import { SETUP_CELEBRATE_KEY } from "@/lib/setup-copy";

export default function InitialSetupPage() {
  const { me } = useAuth();
  const [summary, setSummary] = useState<HomeSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await apiFetch<HomeSummary>("/api/v1/home/summary");
      if (cancelled) return;
      if (result.error) {
        setError(result.error.message);
        return;
      }
      const data = result.data ?? null;
      setSummary(data);
      if (data?.has_active_service && data.has_active_cycle_template) {
        try {
          sessionStorage.setItem(SETUP_CELEBRATE_KEY, "1");
        } catch {
          /* ignore */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-lg space-y-4 animate-fade-up">
      <BackLink href="/app/profile" label="Mais" />
      <div>
        <h1 className="h-display text-3xl text-[var(--color-ink)]">Configuração inicial</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Serviço e modelo de ciclo aceleram a criação de ciclos reais para cada cliente. Nada é
          criado automaticamente.
        </p>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
      {summary ? (
        <InitialSetupCard
          professionCode={me?.organization.profession_code}
          hasService={Boolean(summary.has_active_service)}
          hasTemplate={Boolean(summary.has_active_cycle_template)}
          returnTo="/app/setup"
        />
      ) : (
        <p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p>
      )}
    </div>
  );
}
