"use client";

import { BackLink } from "@/components/app/back-link";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";

type Renewal = {
  id: string;
  client_id: string;
  source_cycle_id: string;
  status: string;
  client_name?: string | null;
  service_name?: string | null;
  requested_at: string;
};

export default function RenewalsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Renewal[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await apiFetch<Renewal[]>("/api/v1/renewal-requests");
      if (cancelled) return;
      if (res.error) setError(res.error.message);
      else setItems(res.data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function reload() {
    const res = await apiFetch<Renewal[]>("/api/v1/renewal-requests");
    if (res.error) setError(res.error.message);
    else setItems(res.data ?? []);
  }

  async function act(id: string, action: "acknowledge" | "resolve" | "dismiss") {
    const res = await apiFetch(`/api/v1/renewal-requests/${id}/${action}`, {
      method: "POST",
      body: "{}",
    });
    if (res.error) {
      setError(res.error.message);
      return;
    }
    await reload();
  }

  async function prepare(id: string) {
    const res = await apiFetch<{
      client_id: string;
      service_id: string | null;
      cycle_template_id: string | null;
      weekdays: number[] | null;
      renewal_request_id: string;
    }>(`/api/v1/renewal-requests/${id}/prepare`);
    if (res.error || !res.data) {
      setError(res.error?.message ?? "Falha ao preparar");
      return;
    }
    const q = new URLSearchParams({
      clientId: res.data.client_id,
      renewalRequestId: res.data.renewal_request_id,
    });
    if (res.data.service_id) q.set("serviceId", res.data.service_id);
    if (res.data.cycle_template_id) q.set("templateId", res.data.cycle_template_id);
    if (res.data.weekdays?.length) q.set("weekdays", res.data.weekdays.join(","));
    router.push(`/app/cycles/new?${q.toString()}`);
  }

  return (
    <div className="space-y-4 animate-fade-up">
      <BackLink href="/app" label="Hoje" />
      <h1 className="h-display text-3xl text-[var(--color-ink)]">Renovações solicitadas</h1>
      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
      {items === null ? (
        <p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p>
      ) : !items.length ? (
        <p className="text-sm text-[var(--color-ink-muted)]">Nenhuma solicitação pendente.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="space-y-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
            >
              <p className="font-semibold">{item.client_name}</p>
              <p className="text-sm text-[var(--color-ink-muted)]">
                {item.service_name} · {item.status}
              </p>
              <div className="flex flex-col gap-2">
                <Button fullWidth onClick={() => void prepare(item.id)}>
                  Preparar renovação
                </Button>
                <Button
                  variant="secondary"
                  fullWidth
                  onClick={() => void act(item.id, "acknowledge")}
                >
                  Marcar como visto
                </Button>
                <Button variant="secondary" fullWidth onClick={() => void act(item.id, "resolve")}>
                  Resolver
                </Button>
                <Button variant="secondary" fullWidth onClick={() => void act(item.id, "dismiss")}>
                  Descartar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
