"use client";

import { useEffect, useState } from "react";
import { apiFetch, type ClientAccess } from "@/lib/api";
import { copyTextToClipboard } from "@/lib/clipboard";
import {
  formatPortalDate,
  formatPortalDateTime,
} from "@/lib/format-portal-dates";
import { portalWhatsAppMessage, whatsappShareHref } from "@/lib/whatsapp-share";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  IconCheck,
  IconChevronRight,
  IconCopy,
  IconExternalLink,
  IconWhatsApp,
} from "@/components/ui/icons";

type Props = {
  clientId: string;
  firstName: string;
  phone: string | null;
  access: ClientAccess | null;
  onAccessChange: (access: ClientAccess) => void;
  onFeedback?: (message: string | null, tone?: "info" | "error") => void;
};

export function ClientPortalCard({
  clientId,
  firstName,
  phone,
  access,
  onAccessChange,
  onFeedback,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState<"rotate" | "revoke" | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const publicUrl = access?.has_active_link
    ? (access.public_url ?? null)
    : null;
  const publicPath = access?.has_active_link
    ? (access.public_path ?? null)
    : null;

  async function createAccess() {
    setBusy(true);
    setCopyError(null);
    onFeedback?.(null);
    const result = await apiFetch<ClientAccess>(
      `/api/v1/clients/${clientId}/public-access`,
      {
        method: "POST",
        body: "{}",
      },
    );
    setBusy(false);
    if (result.error) {
      onFeedback?.(result.error.message, "error");
      return;
    }
    if (result.data) onAccessChange(result.data);
  }

  async function copyLink() {
    if (!publicUrl) {
      setCopyError("Crie um acesso para copiar o endereço.");
      return;
    }
    const result = await copyTextToClipboard(publicUrl);
    if (result.ok) {
      setCopied(true);
      setCopyError(null);
      onFeedback?.(null);
      return;
    }
    setCopied(false);
    setCopyError(
      "Não foi possível copiar automaticamente. Selecione o endereço e copie manualmente.",
    );
  }

  async function rotateAccess() {
    setBusy(true);
    onFeedback?.(null);
    const result = await apiFetch<ClientAccess>(
      `/api/v1/clients/${clientId}/public-access/rotate`,
      { method: "POST", body: "{}" },
    );
    setBusy(false);
    setConfirm(null);
    if (result.error) {
      onFeedback?.(result.error.message, "error");
      return;
    }
    if (result.data) onAccessChange(result.data);
    setCopied(false);
  }

  async function revokeAccess() {
    setBusy(true);
    onFeedback?.(null);
    const result = await apiFetch<ClientAccess>(
      `/api/v1/clients/${clientId}/public-access`,
      {
        method: "DELETE",
      },
    );
    setBusy(false);
    setConfirm(null);
    if (result.error) {
      onFeedback?.(result.error.message, "error");
      return;
    }
    onAccessChange(result.data ?? { has_active_link: false });
    setCopied(false);
  }

  const waText =
    (publicUrl && access?.wa_message_template?.includes(publicUrl)
      ? access.wa_message_template
      : null) || (publicUrl ? portalWhatsAppMessage(firstName, publicUrl) : "");
  const waHref = publicUrl ? whatsappShareHref(phone, waText) : null;

  return (
    <section
      id="portal-do-cliente"
      aria-label="Portal do cliente"
      className="min-w-0 space-y-3 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold text-[var(--color-ink)]">
          Portal do cliente
        </h2>
        {access?.has_active_link ? (
          <Badge tone="success">Acesso ativo</Badge>
        ) : null}
      </div>

      {!access?.has_active_link ? (
        <>
          <p className="text-sm leading-relaxed text-[var(--color-ink-muted)]">
            Compartilhe um acesso para que o cliente acompanhe agenda, ciclo,
            evolução e conteúdos publicados.
          </p>
          <Button fullWidth disabled={busy} onClick={() => void createAccess()}>
            Criar acesso
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-[var(--color-ink-muted)]">
            O cliente pode acompanhar as informações publicadas
          </p>
          <dl className="space-y-1 text-sm">
            <div className="flex gap-2">
              <dt className="text-[var(--color-ink-muted)]">Criado em:</dt>
              <dd>{formatPortalDate(access.created_at) ?? "—"}</dd>
            </div>
            <div className="flex min-w-0 gap-2">
              <dt className="shrink-0 text-[var(--color-ink-muted)]">
                Último acesso:
              </dt>
              <dd className="min-w-0">
                {access.last_used_at
                  ? formatPortalDateTime(access.last_used_at)
                  : "Ainda não acessado"}
              </dd>
            </div>
          </dl>

          <div className="min-w-0">
            <p className="mb-1 text-sm font-medium text-[var(--color-ink)]">
              Endereço
            </p>
            <p
              className="truncate rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 font-mono text-sm text-[var(--color-ink-muted)]"
              data-testid="portal-url"
            >
              {publicUrl}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Button fullWidth disabled={busy} onClick={() => void copyLink()}>
              <span className="inline-flex items-center gap-2">
                {copied ? <IconCheck /> : <IconCopy />}
                {copied ? "Link copiado" : "Copiar link"}
              </span>
            </Button>
            {waHref ? (
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                <Button fullWidth variant="secondary">
                  <span className="inline-flex items-center gap-2">
                    <IconWhatsApp />
                    Enviar pelo WhatsApp
                  </span>
                </Button>
              </a>
            ) : null}
            {publicPath ? (
              <a
                href={publicPath}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                <Button fullWidth variant="outline">
                  <span className="inline-flex items-center gap-2">
                    <IconExternalLink />
                    Abrir portal
                  </span>
                </Button>
              </a>
            ) : null}
          </div>

          {copyError ? (
            <p role="alert" className="text-sm text-[var(--color-danger)]">
              {copyError}
            </p>
          ) : null}

          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-1 py-1 text-sm font-medium text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)] [&::-webkit-details-marker]:hidden">
              <IconChevronRight className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-90" />
              Mais opções
            </summary>
            <div className="mt-2 flex flex-col gap-2 border-t border-[var(--color-border)] pt-3">
              <Button
                fullWidth
                variant="secondary"
                disabled={busy}
                onClick={() => setConfirm("rotate")}
              >
                Gerar novo link
              </Button>
              <Button
                fullWidth
                variant="ghost"
                disabled={busy}
                onClick={() => setConfirm("revoke")}
              >
                Desativar acesso
              </Button>
            </div>
          </details>
        </>
      )}

      <ConfirmDialog
        open={confirm === "rotate"}
        title="Gerar um novo link?"
        description="O acesso enviado anteriormente deixará de funcionar. Você precisará compartilhar o novo endereço com o cliente."
        confirmLabel="Gerar novo link"
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void rotateAccess()}
      />
      <ConfirmDialog
        open={confirm === "revoke"}
        title="Desativar acesso?"
        description="O cliente não conseguirá mais abrir o portal até que um novo acesso seja criado."
        confirmLabel="Desativar acesso"
        confirmVariant="danger"
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void revokeAccess()}
      />
    </section>
  );
}
