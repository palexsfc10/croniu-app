"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, type Client, type ClientAccess, type PublicMyCycle } from "@/lib/api";
import { copyTextToClipboard } from "@/lib/clipboard";
import { BackLink } from "@/components/app/back-link";
import { PortalView } from "@/components/app/portal-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconCopy, IconExternalLink } from "@/components/ui/icons";

export default function PortalPreviewPage() {
  const params = useParams<{ clientId: string }>();
  const router = useRouter();
  const clientId = params.clientId;
  const [client, setClient] = useState<Client | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [access, setAccess] = useState<ClientAccess | null>(null);
  const [data, setData] = useState<PublicMyCycle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const [c, list, acc, preview] = await Promise.all([
      apiFetch<Client>(`/api/v1/clients/${clientId}`),
      apiFetch<Client[]>(`/api/v1/clients?status=active`),
      apiFetch<ClientAccess>(`/api/v1/clients/${clientId}/public-access`),
      apiFetch<PublicMyCycle>(`/api/v1/clients/${clientId}/portal-preview`),
    ]);
    if (c.error) setError(c.error.message);
    else setClient(c.data ?? null);
    if (list.data) setClients(list.data);
    if (acc.data) setAccess(acc.data);
    if (preview.error) setError(preview.error.message);
    else setData(preview.data ?? null);
  }, [clientId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount/param hydrate
    void load();
  }, [load]);

  async function copyLink() {
    if (!access?.public_url) return;
    const result = await copyTextToClipboard(access.public_url);
    if (result.ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <BackLink href={`/app/clients/${clientId}`} label="Voltar ao cliente" />
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-[var(--color-ink-muted)]" htmlFor="preview-client-select">
            Cliente
          </label>
          <select
            id="preview-client-select"
            className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm"
            value={clientId}
            onChange={(e) => router.push(`/app/clients/${e.target.value}/portal-preview`)}
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
        <Badge tone="info">Prévia do Portal</Badge>
        <p className="text-sm text-[var(--color-ink-muted)]">
          Esta é uma reprodução fiel do que {client?.full_name ?? "o cliente"} vê no Portal — mesmos
          dados, mesma ordem, mesmos estados. Ações de renovação e pagamento estão desativadas aqui.
        </p>
        {access?.public_url ? (
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void copyLink()}>
              <span className="inline-flex items-center gap-2">
                <IconCopy />
                {copied ? "Link copiado" : "Copiar link do portal"}
              </span>
            </Button>
            <a href={access.public_path ?? "#"} target="_blank" rel="noopener noreferrer">
              <Button variant="outline">
                <span className="inline-flex items-center gap-2">
                  <IconExternalLink />
                  Abrir portal real
                </span>
              </Button>
            </a>
          </div>
        ) : (
          <p className="ml-auto text-sm text-[var(--color-ink-muted)]">
            Nenhum acesso criado ainda para este cliente.
          </p>
        )}
      </div>

      {error ? (
        <p
          role="alert"
          className="mb-4 rounded-[var(--radius-md)] border border-[var(--color-danger)]/25 bg-[var(--color-danger-subtle)] px-4 py-3 text-sm text-[var(--color-danger)]"
        >
          {error}
        </p>
      ) : null}

      {data ? (
        <div className="mx-auto max-w-md rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[linear-gradient(165deg,var(--color-bg)_0%,var(--color-progress-subtle)_42%,var(--color-primary-subtle)_100%)] p-4 shadow-sm sm:p-6">
          <p className="mb-4 font-[family-name:var(--font-display)] text-[1.5rem] leading-tight text-[var(--color-ink)]">
            Olá, {data.client_first_name}
          </p>
          <PortalView data={data} mode="preview" />
        </div>
      ) : !error ? (
        <p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p>
      ) : null}
    </div>
  );
}
