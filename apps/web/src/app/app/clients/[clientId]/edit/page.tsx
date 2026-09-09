"use client";

import { BackLink } from "@/components/app/back-link";
import { ClientEditForm } from "@/components/app/client-edit-form";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch, type Client } from "@/lib/api";

/**
 * Mobile keeps this as its own simple page (and it's still the desktop
 * fallback for a direct/refreshed link) — the redesign only moves the
 * *desktop* entry point into `ClientEditDrawer`, which reuses the same
 * `ClientEditForm` so the two surfaces can't drift apart.
 */
export default function EditClientPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await apiFetch<Client>(`/api/v1/clients/${clientId}`);
      if (cancelled) return;
      if (result.error) {
        setLoadError(result.error.message);
      } else {
        setClient(result.data ?? null);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  return (
    <div className="space-y-4 animate-fade-up">
      <div>
        <BackLink href={`/app/clients/${clientId}`} label="Voltar" />
        <h1 className="mt-2 h-display text-3xl text-[var(--color-ink)]">Editar cliente</h1>
      </div>
      {loading ? (
        <p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p>
      ) : loadError || !client ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {loadError || "Não foi possível carregar este cliente."}
        </p>
      ) : (
        <ClientEditForm
          client={client}
          onSaved={() => {
            router.replace(`/app/clients/${clientId}`);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
