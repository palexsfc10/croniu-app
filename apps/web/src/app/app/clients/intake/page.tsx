"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  apiFetch,
  type IntakeLink,
  type IntakeSubmissionListItem,
} from "@/lib/api";
import { submissionStatusLabel } from "@/lib/intake";
import { BackLink } from "@/components/app/back-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { IconWhatsApp } from "@/components/ui/icons";

export default function ClientsIntakePage() {
  const [link, setLink] = useState<IntakeLink | null>(null);
  const [rawToken, setRawToken] = useState<string | null>(null);
  const [items, setItems] = useState<IntakeSubmissionListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [linkRes, listRes] = await Promise.all([
      apiFetch<IntakeLink>("/api/v1/intake-link"),
      apiFetch<IntakeSubmissionListItem[]>(
        "/api/v1/intake-submissions?status=pending_review",
      ),
    ]);
    if (linkRes.error) setError(linkRes.error.message);
    else setLink(linkRes.data ?? null);
    if (listRes.error) setError(listRes.error.message);
    else setItems(listRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await load();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  function publicUrl(token?: string | null) {
    if (token) return `${window.location.origin}/entrar/${token}`;
    if (link?.public_url) return link.public_url;
    if (link?.public_path) return `${window.location.origin}${link.public_path}`;
    return null;
  }

  async function createLink() {
    setBusy(true);
    setError(null);
    setInfo(null);
    const result = await apiFetch<IntakeLink>("/api/v1/intake-link", {
      method: "POST",
      body: "{}",
    });
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setLink(result.data ?? null);
    setRawToken(result.data?.token ?? null);
    setInfo("Link criado. Copie agora — o token completo não será mostrado de novo.");
  }

  async function rotateLink() {
    if (
      !window.confirm(
        "Gerar um novo link invalida o atual. Quem já tiver o endereço antigo precisará do novo.",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    const result = await apiFetch<IntakeLink>("/api/v1/intake-link/rotate", {
      method: "POST",
      body: "{}",
    });
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setLink(result.data ?? null);
    setRawToken(result.data?.token ?? null);
    setInfo("Novo link gerado. Copie agora.");
  }

  async function disableLink() {
    if (!window.confirm("Desativar o link de convite? Novos cadastros ficarão bloqueados.")) {
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    const result = await apiFetch<IntakeLink>("/api/v1/intake-link/disable", {
      method: "POST",
      body: "{}",
    });
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setLink(result.data ?? null);
    setRawToken(null);
    setInfo("Link desativado.");
  }

  async function copyLink() {
    const url = publicUrl(rawToken) || publicUrl(link?.token);
    if (!url || (!rawToken && !link?.token && !link?.public_url)) {
      setInfo("Crie ou regenere o link para copiar o endereço completo.");
      return;
    }
    await navigator.clipboard.writeText(url);
    setInfo("Link copiado.");
  }

  function shareWhatsApp() {
    const url = publicUrl(rawToken) || publicUrl(link?.token);
    if (link?.wa_message_url) {
      window.open(link.wa_message_url, "_blank", "noopener,noreferrer");
      return;
    }
    if (!url) {
      setInfo("Crie o link antes de compartilhar.");
      return;
    }
    const text = encodeURIComponent(
      `Olá! Complete seu cadastro neste link: ${url}`,
    );
    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-5 animate-fade-up">
      <BackLink href="/app/clients" label="Clientes" />
      <div>
        <h1 className="h-display text-3xl text-[var(--color-ink)]">Novos alunos</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Convite permanente e fila de cadastros para analisar.
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
      {info ? (
        <p role="status" className="text-sm text-[var(--color-ink-muted)]">
          {info}
        </p>
      ) : null}

      <section
        aria-label="Convidar aluno"
        className="space-y-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
      >
        <h2 className="text-base font-semibold">Convidar aluno</h2>
        <p className="text-sm text-[var(--color-ink-muted)]">
          Link da organização para cadastro com anamnese. Trate como senha compartilhável.
        </p>
        <p className="text-sm">
          {link?.has_active_link ? "Há um link ativo." : "Nenhum link ativo."}
        </p>
        {!link?.has_active_link ? (
          <Button fullWidth disabled={busy} onClick={() => void createLink()}>
            Criar link de convite
          </Button>
        ) : (
          <div className="flex flex-col gap-2">
            <Button fullWidth disabled={busy} onClick={() => void copyLink()}>
              Copiar link
            </Button>
            {rawToken || link.token || link.public_path ? (
              <a
                href={
                  rawToken
                    ? `/entrar/${rawToken}`
                    : link.public_path || (link.token ? `/entrar/${link.token}` : "#")
                }
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                <Button fullWidth variant="secondary">
                  Abrir
                </Button>
              </a>
            ) : null}
            <Button
              fullWidth
              variant="secondary"
              disabled={busy}
              onClick={shareWhatsApp}
            >
              <span className="inline-flex items-center gap-2">
                <IconWhatsApp className="h-4 w-4" aria-hidden />
                WhatsApp
              </span>
            </Button>
            <Button fullWidth variant="secondary" disabled={busy} onClick={() => void rotateLink()}>
              Regenerar link
            </Button>
            <Button fullWidth variant="danger" disabled={busy} onClick={() => void disableLink()}>
              Desativar
            </Button>
          </div>
        )}
      </section>

      <section aria-label="Fila de análise" className="space-y-3">
        <h2 className="text-base font-semibold">Aguardando análise</h2>
        {loading ? (
          <p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p>
        ) : null}
        {!loading && !items.length ? (
          <EmptyState
            title="Nenhum cadastro pendente"
            description="Quando alguém enviar o formulário pelo link, aparece aqui."
          />
        ) : null}
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/app/clients/intake/${item.id}`}
                className="block rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3 transition-colors hover:bg-[var(--color-primary-subtle)]/40"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-[var(--color-ink)]">{item.full_name}</p>
                  {item.requires_professional_attention ? (
                    <Badge tone="warning">Atenção</Badge>
                  ) : null}
                  {item.duplicate_alert ? <Badge tone="info">Possível duplicata</Badge> : null}
                  {item.archived_match ? <Badge tone="neutral">Match arquivado</Badge> : null}
                </div>
                <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                  {item.primary_goal}
                </p>
                <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                  {submissionStatusLabel(item.status)}
                  {item.submitted_at
                    ? ` · ${new Date(item.submitted_at).toLocaleString("pt-BR")}`
                    : ""}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
