"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  apiFetch,
  type IntakeLink,
  type OnboardingBoard,
  type OnboardingBoardItem,
} from "@/lib/api";
import { useAuth } from "@/components/auth/auth-provider";
import { nomenclatureFor, recommendedFormLabel } from "@/lib/nomenclature";
import { BackLink } from "@/components/app/back-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { IconMoreHorizontal, IconWhatsApp } from "@/components/ui/icons";

const EMPTY_BOARD: OnboardingBoard = {
  attention: [],
  invite_pending: [],
  in_progress: [],
  completed: [],
  draft_evaluations: [],
};

function timeAgo(days: number | null): string {
  if (days === null) return "—";
  if (days <= 0) return "hoje";
  if (days === 1) return "há 1 dia";
  return `há ${days} dias`;
}

function entryTypeLabel(entry: "manual" | "convite"): string {
  return entry === "convite" ? "Convite" : "Manual";
}

function nextActionFor(item: OnboardingBoardItem): { label: string; href: string } {
  if (item.submission_id) {
    return { label: "Analisar cadastro", href: `/app/clients/intake/${item.submission_id}` };
  }
  return { label: item.next_action_label || "Abrir cliente", href: `/app/clients/${item.client_id}` };
}

function LinkManager() {
  const [link, setLink] = useState<IntakeLink | null>(null);
  const [rawToken, setRawToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { me } = useAuth();
  const terms = nomenclatureFor(me?.organization.profession_code);

  useEffect(() => {
    void (async () => {
      const res = await apiFetch<IntakeLink>("/api/v1/intake-link");
      if (res.error) setError(res.error.message);
      else setLink(res.data ?? null);
    })();
  }, []);

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
    const result = await apiFetch<IntakeLink>("/api/v1/intake-link", { method: "POST", body: "{}" });
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
    if (!window.confirm("Desativar o link de convite? Novos cadastros ficarão bloqueados.")) return;
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
    const text = encodeURIComponent(`Olá! Complete o ${terms.intake_form} neste link: ${url}`);
    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
  }

  return (
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
      <p className="text-sm">{link?.has_active_link ? "Link ativo" : "Nenhum link ativo."}</p>
      {!link?.has_active_link ? (
        <Button fullWidth disabled={busy} onClick={() => void createLink()}>
          Criar link de convite
        </Button>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
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
  );
}

function AttentionBadges({ item }: { item: OnboardingBoardItem }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {item.requires_professional_attention ? <Badge tone="warning">Exige atenção</Badge> : null}
      <Badge tone="neutral">{entryTypeLabel(item.entry_type)}</Badge>
    </div>
  );
}

function DesktopGroup({
  title,
  description,
  items,
  emptyText,
  compact,
}: {
  title: string;
  description: string;
  items: OnboardingBoardItem[];
  emptyText: string;
  compact?: boolean;
}) {
  if (!items.length) {
    return (
      <section aria-label={title} className="space-y-2">
        <div>
          <h2 className="text-base font-semibold text-[var(--color-ink)]">
            {title} <span className="text-[var(--color-ink-muted)]">0</span>
          </h2>
          <p className="text-sm text-[var(--color-ink-muted)]">{description}</p>
        </div>
        <p className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] px-3 py-3 text-sm text-[var(--color-ink-muted)]">
          {emptyText}
        </p>
      </section>
    );
  }

  return (
    <section aria-label={title} className="space-y-2">
      <div>
        <h2 className="text-base font-semibold text-[var(--color-ink)]">
          {title} <span className="text-[var(--color-ink-muted)]">{items.length}</span>
        </h2>
        <p className="text-sm text-[var(--color-ink-muted)]">{description}</p>
      </div>
      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)]/80 bg-[var(--color-surface)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)]/60 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
              <th className="px-3.5 py-2.5">Cliente</th>
              {!compact ? <th className="px-3.5 py-2.5">Entrada</th> : null}
              <th className="px-3.5 py-2.5">Estado</th>
              <th className="px-3.5 py-2.5">Tempo</th>
              {!compact ? <th className="px-3.5 py-2.5">Falta</th> : null}
              <th className="px-3.5 py-2.5">Próxima ação</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const next = nextActionFor(item);
              return (
                <tr key={item.client_id} className="border-b border-[var(--color-border)]/50 last:border-b-0">
                  <td className="px-3.5 py-3 font-medium text-[var(--color-ink)]">
                    <div className="flex flex-col gap-1">
                      <span>{item.client_name}</span>
                      {compact ? <AttentionBadges item={item} /> : null}
                    </div>
                  </td>
                  {!compact ? (
                    <td className="px-3.5 py-3 text-[var(--color-ink-muted)]">
                      {entryTypeLabel(item.entry_type)}
                    </td>
                  ) : null}
                  <td className="px-3.5 py-3 text-[var(--color-ink-muted)]">{item.stage_label}</td>
                  <td className="px-3.5 py-3 text-[var(--color-ink-muted)]">
                    {timeAgo(item.days_since_update)}
                  </td>
                  {!compact ? (
                    <td className="px-3.5 py-3 text-[var(--color-ink-muted)]">
                      {item.attention_note || "—"}
                    </td>
                  ) : null}
                  <td className="px-3.5 py-3">
                    <Link
                      href={next.href}
                      className="font-medium text-[var(--color-primary)] hover:underline"
                    >
                      {next.label}
                    </Link>
                    <span className="mx-1.5 text-[var(--color-border)]">·</span>
                    <Link href={`/app/clients/${item.client_id}`} className="text-[var(--color-link)] hover:underline">
                      Abrir cliente
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MobileClientRow({ item }: { item: OnboardingBoardItem }) {
  const next = nextActionFor(item);
  return (
    <li className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-[var(--color-ink)]">{item.client_name}</p>
          <p className="text-sm text-[var(--color-ink-muted)]">
            {item.stage_label} · {timeAgo(item.days_since_update)}
          </p>
        </div>
        <AttentionBadges item={item} />
      </div>
      <div className="mt-2 flex flex-wrap gap-3">
        <Link href={next.href} className="text-sm font-medium text-[var(--color-primary)]">
          {next.label}
        </Link>
        <Link href={`/app/clients/${item.client_id}`} className="text-sm font-medium text-[var(--color-link)]">
          Abrir cliente
        </Link>
      </div>
    </li>
  );
}

export default function ClientsIntakePage() {
  const { me } = useAuth();
  const [board, setBoard] = useState<OnboardingBoard>(EMPTY_BOARD);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await apiFetch<OnboardingBoard>("/api/v1/clients/onboarding-board");
    if (res.error) setError(res.error.message);
    else setBoard(res.data ?? EMPTY_BOARD);
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

  const formTitle =
    me?.organization.form_title ||
    recommendedFormLabel(me?.organization.profession_code, me?.organization.profession_specialty);

  const mobileWaiting = [...board.attention, ...board.in_progress].slice(0, 8);
  const topInvitePending = board.invite_pending[0] ?? null;

  return (
    <div className="space-y-6 animate-fade-up">
      <BackLink href="/app/clients" label="Clientes" />
      <div>
        <h1 className="h-display text-3xl text-[var(--color-ink)]">Onboarding de clientes</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Entrada e evolução do cadastro de cada cliente. Formulário: {formTitle}.
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}

      <LinkManager />

      <Link
        href="/app/clients/new"
        className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-primary-subtle)]/30"
      >
        Cadastrar cliente manualmente
      </Link>

      {loading ? <p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p> : null}

      {/* Desktop: grupos completos em tabela */}
      <div className="hidden lg:block lg:space-y-6">
        <DesktopGroup
          title="Exige atenção"
          description="Precisa de uma decisão sua antes de continuar."
          items={board.attention}
          emptyText="Nenhum cliente exigindo atenção agora."
        />
        <DesktopGroup
          title="Convite pendente"
          description="Cadastro criado, aguardando o preenchimento inicial."
          items={board.invite_pending}
          emptyText="Nenhum convite pendente."
          compact
        />
        <DesktopGroup
          title="Em preenchimento"
          description="Ficha enviada, aguardando sua análise ou reenvio do cliente."
          items={board.in_progress}
          emptyText="Nenhum cadastro em preenchimento."
        />
        <DesktopGroup
          title="Concluídos recentemente"
          description="Últimos clientes que passaram pela entrada e já estão em acompanhamento."
          items={board.completed}
          emptyText="Nenhuma conclusão recente."
          compact
        />
      </div>

      {/* Mobile: digest com divulgação progressiva, sem tabela comprimida */}
      <div className="space-y-6 lg:hidden">
        <section aria-label="Aguardando alguma ação" className="space-y-2">
          <h2 className="text-base font-semibold text-[var(--color-ink)]">Aguardando alguma ação</h2>
          {mobileWaiting.length ? (
            <ul className="space-y-2">
              {mobileWaiting.map((item) => (
                <MobileClientRow key={item.client_id} item={item} />
              ))}
            </ul>
          ) : (
            <EmptyState title="Tudo em dia" description="Nenhum cliente esperando ação sua agora." />
          )}
        </section>

        {topInvitePending ? (
          <section aria-label="Convite pendente mais importante" className="space-y-2">
            <h2 className="text-base font-semibold text-[var(--color-ink)]">Convite pendente</h2>
            <MobileClientRow item={topInvitePending} />
            {board.invite_pending.length > 1 ? (
              <p className="text-xs text-[var(--color-ink-muted)]">
                +{board.invite_pending.length - 1} outro(s) convite(s) pendente(s).
              </p>
            ) : null}
          </section>
        ) : null}

        <section aria-label="Avaliações em rascunho" className="space-y-2">
          <h2 className="text-base font-semibold text-[var(--color-ink)]">Avaliações em rascunho</h2>
          {board.draft_evaluations.length ? (
            <ul className="space-y-2">
              {board.draft_evaluations.slice(0, 5).map((draft) => (
                <li
                  key={draft.evaluation_id}
                  className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-3"
                >
                  <p className="font-semibold text-[var(--color-ink)]">{draft.title}</p>
                  <p className="text-sm text-[var(--color-ink-muted)]">{draft.client_name}</p>
                  <Link
                    href={`/app/clients/${draft.client_id}/evaluations/${draft.evaluation_id}`}
                    className="mt-1 inline-block text-sm font-medium text-[var(--color-primary)]"
                  >
                    Continuar rascunho
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Sem rascunhos" description="Nenhuma avaliação em rascunho agora." />
          )}
        </section>

        <Link
          href="/app/assistant"
          className="block rounded-[var(--radius-lg)] border border-[var(--color-primary)]/30 bg-[var(--color-primary-subtle)]/40 px-3.5 py-3 text-sm font-semibold text-[var(--color-ink)]"
        >
          Perguntar ao Assistente sobre estes clientes
        </Link>
      </div>
    </div>
  );
}
