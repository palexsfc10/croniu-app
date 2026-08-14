"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, type IntakeLink, type IntakeSubmissionListItem, type ProfessionProfile } from "@/lib/api";
import { nomenclatureFor, recommendedFormLabel } from "@/lib/nomenclature";
import { submissionStatusLabel } from "@/lib/intake";
import { BackLink } from "@/components/app/back-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { IconMoreHorizontal, IconWhatsApp } from "@/components/ui/icons";

export default function ClientsIntakePage() {
  const [link, setLink] = useState<IntakeLink | null>(null);
  const [rawToken, setRawToken] = useState<string | null>(null);
  const [items, setItems] = useState<IntakeSubmissionListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profession, setProfession] = useState<ProfessionProfile | null>(null);

  const load = useCallback(async () => {
    const [linkRes, listRes, profRes] = await Promise.all([
      apiFetch<IntakeLink>("/api/v1/intake-link"),
      apiFetch<IntakeSubmissionListItem[]>(
        "/api/v1/intake-submissions?status=pending_review",
      ),
      apiFetch<ProfessionProfile>("/api/v1/organization/profession"),
    ]);
    if (linkRes.error) setError(linkRes.error.message);
    else setLink(linkRes.data ?? null);
    if (listRes.error) setError(listRes.error.message);
    else setItems(listRes.data ?? []);
    if (profRes.data) setProfession(profRes.data);
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

  const terms = nomenclatureFor(profession?.profession_code);

  return (
    <div className="space-y-5 animate-fade-up">
      <BackLink href="/app/clients" label={terms.clients.charAt(0).toUpperCase() + terms.clients.slice(1)} />
      <div>
        <h1 className="h-display text-3xl text-[var(--color-ink)]">{terms.new_intake}</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Convite permanente e fila de cadastros para analisar. Recomendação:{" "}
          {recommendedFormLabel(profession?.profession_code, profession?.profession_specialty)}.
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
        aria-label="Link de cadastro"
        className="space-y-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">Link de cadastro</h2>
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
              Compartilhe este link para receber novos cadastros. Quem tiver o endereço poderá
              preencher o formulário.
            </p>
          </div>
          {link?.has_active_link ? (
            <div className="relative">
              <Button
                variant="ghost"
                className="min-h-11 min-w-11 px-2"
                aria-label="Mais ações do link"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
              >
                <IconMoreHorizontal className="h-5 w-5" />
              </Button>
              {menuOpen ? (
                <div className="absolute right-0 z-10 mt-1 min-w-44 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-sm">
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm"
                    disabled={busy}
                    onClick={() => {
                      setMenuOpen(false);
                      void rotateLink();
                    }}
                  >
                    Regenerar link
                  </button>
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm text-[var(--color-danger)]"
                    disabled={busy}
                    onClick={() => {
                      setMenuOpen(false);
                      void disableLink();
                    }}
                  >
                    Desativar link
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <p className="text-sm">
          {link?.has_active_link ? "Link ativo" : "Nenhum link ativo."}
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
            <Button
              fullWidth
              variant="secondary"
              disabled={busy}
              onClick={shareWhatsApp}
              className="inline-flex items-center justify-center gap-2"
            >
              <IconWhatsApp className="h-5 w-5" aria-hidden />
              Compartilhar no WhatsApp
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
