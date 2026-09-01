"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  apiFetch,
  type Client,
  type Cycle,
  type HomeSummary,
  type IntakeLink,
  type IntakeSubmissionListItem,
} from "@/lib/api";
import { useAuth } from "@/components/auth/auth-provider";
import { nomenclatureFor } from "@/lib/nomenclature";
import { clientInitials, clientListPresentation } from "@/lib/client-list";
import { copyTextToClipboard } from "@/lib/clipboard";
import { ActionSheet } from "@/components/ui/action-sheet";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  IconChevronRight,
  IconClipboardList,
  IconLink,
  IconPlus,
  IconUser,
  IconWhatsApp,
} from "@/components/ui/icons";

type InviteState = "idle" | "loading" | "ready" | "error";

/** Extracts the exact message (greeting + link) already baked into the
 * WhatsApp share URL, so "copiar convite" and "enviar pelo WhatsApp"
 * always send identical text. */
function inviteMessageFrom(waMessageUrl: string | null | undefined): string | null {
  if (!waMessageUrl) return null;
  try {
    const text = new URL(waMessageUrl).searchParams.get("text");
    return text && text.trim() ? text : null;
  } catch {
    return null;
  }
}

function InviteButton({ variant = "secondary" }: { variant?: "primary" | "secondary" }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<InviteState>("idle");
  const [link, setLink] = useState<IntakeLink | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const inFlight = useRef<Promise<void> | null>(null);

  async function ensureLink() {
    if (inFlight.current) return inFlight.current;
    const task = (async () => {
      setState("loading");
      setCopied(false);
      const res = await apiFetch<IntakeLink>("/api/v1/intake-link");
      if (res.error) {
        setState("error");
        return;
      }
      let data = res.data ?? null;
      if (data && !data.has_active_link) {
        const created = await apiFetch<IntakeLink>("/api/v1/intake-link", {
          method: "POST",
          body: "{}",
        });
        if (created.error) {
          setState("error");
          return;
        }
        data = created.data ?? null;
      }
      if (!data?.public_url) {
        setState("error");
        return;
      }
      setLink(data);
      setState("ready");
    })();
    inFlight.current = task;
    try {
      await task;
    } finally {
      inFlight.current = null;
    }
  }

  function openSheet() {
    setOpen(true);
    setCopyError(false);
    void ensureLink();
  }

  async function copyInvite() {
    const message = inviteMessageFrom(link?.wa_message_url) ?? link?.public_url ?? null;
    if (!message) {
      setState("error");
      return;
    }
    const result = await copyTextToClipboard(message);
    setCopied(result.ok);
    setCopyError(!result.ok);
  }

  function sendWhatsApp() {
    if (!link?.wa_message_url) {
      setState("error");
      return;
    }
    window.open(link.wa_message_url, "_blank", "noopener,noreferrer");
  }

  return (
    <span className="min-w-0">
      <Button
        variant={variant}
        className="min-h-11 whitespace-nowrap"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openSheet())}
      >
        <IconLink className="mr-1.5 h-4 w-4" />
        Convidar aluno
      </Button>
      <ActionSheet open={open} onClose={() => setOpen(false)} labelledBy="generic-invite-title">
        <h2 id="generic-invite-title" className="text-base font-semibold text-[var(--color-ink)]">
          Convide um aluno
        </h2>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Envie este convite para o aluno preencher o cadastro.
        </p>

        {state === "loading" ? (
          <p className="mt-3 text-sm text-[var(--color-ink-muted)]">Preparando convite…</p>
        ) : null}

        {state === "error" ? (
          <div className="mt-3 space-y-2">
            <p role="alert" className="text-sm text-[var(--color-danger)]">
              Não foi possível preparar o convite. Tente novamente.
            </p>
            <Button fullWidth variant="secondary" onClick={() => void ensureLink()}>
              Tentar novamente
            </Button>
          </div>
        ) : null}

        {state === "ready" && link ? (
          <div className="mt-3 flex flex-col gap-2">
            <Button
              fullWidth
              onClick={sendWhatsApp}
              className="inline-flex items-center justify-center gap-2"
            >
              <IconWhatsApp className="h-5 w-5" aria-hidden />
              Enviar pelo WhatsApp
            </Button>
            <Button fullWidth variant="secondary" onClick={() => void copyInvite()}>
              Copiar convite
            </Button>
            {copyError || copied ? (
              <p
                role="status"
                className={`text-center text-xs ${
                  copyError ? "text-[var(--color-danger)]" : "text-[var(--color-ink-muted)]"
                }`}
              >
                {copyError ? "Não foi possível copiar. Tente novamente." : "Convite copiado"}
              </p>
            ) : null}
          </div>
        ) : null}
      </ActionSheet>
    </span>
  );
}

export default function ClientsPage() {
  const { me } = useAuth();
  const [items, setItems] = useState<Client[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [today, setToday] = useState("");
  const [pendingIntakes, setPendingIntakes] = useState<IntakeSubmissionListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"active" | "archived">("active");
  const [query, setQuery] = useState("");
  const terms = nomenclatureFor(me?.organization.profession_code);
  const title = terms.clients.charAt(0).toUpperCase() + terms.clients.slice(1);
  const addLabel = `Adicionar ${terms.client}`;
  const emptyTitle = `Nenhum ${terms.client} cadastrado`;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const [result, cycleRes, home, pendingRes] = await Promise.all([
        apiFetch<Client[]>(`/api/v1/clients?status=${statusFilter}`),
        apiFetch<Cycle[]>("/api/v1/cycles"),
        apiFetch<HomeSummary>("/api/v1/home/summary"),
        apiFetch<IntakeSubmissionListItem[]>("/api/v1/intake-submissions?status=pending_review"),
      ]);
      if (cancelled) return;
      if (result.error) setError(result.error.message);
      else {
        setError(null);
        setItems(result.data ?? []);
      }
      setCycles(cycleRes.data ?? []);
      setToday(home.data?.local_today ?? "");
      setPendingIntakes(pendingRes.data ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [statusFilter]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.full_name.toLowerCase().includes(q));
  }, [items, query]);

  const showSearch = items.length >= 8 || query.length > 0;

  return (
    <div className="space-y-5 animate-fade-up pb-4 md:space-y-6">
      <header className="space-y-3">
        <div>
          <h1 className="h-display text-3xl text-[var(--color-ink)] md:text-[2.25rem]">{title}</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            Pessoas que você atende, com o próximo passo à vista.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/app/clients/new" className="min-w-0">
            <Button className="whitespace-nowrap">
              <IconPlus className="mr-1.5 h-4 w-4" />
              {addLabel}
            </Button>
          </Link>
          <InviteButton />
        </div>
        {pendingIntakes.length > 0 ? (
          <Link
            href={
              pendingIntakes.length === 1
                ? `/app/clients/intake/${pendingIntakes[0]!.id}`
                : "/app/clients/intake"
            }
            className="flex items-start gap-3 rounded-[var(--radius-lg)] border border-[var(--color-primary)]/25 bg-[var(--color-primary-subtle)]/60 p-4 transition-colors hover:bg-[var(--color-primary-subtle)]"
          >
            <span
              className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface)] text-[var(--color-primary)]"
              aria-hidden
            >
              <IconClipboardList className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-[var(--color-ink)]">
                {pendingIntakes.length === 1
                  ? "Novo cadastro aguardando análise"
                  : `${pendingIntakes.length} cadastros aguardando análise`}
              </span>
              <span className="mt-0.5 block text-sm text-[var(--color-ink-muted)]">
                {pendingIntakes.length === 1
                  ? `${pendingIntakes[0]!.full_name} enviou as informações para você analisar.`
                  : `Revise as informações enviadas pelos novos ${terms.clients}.`}
              </span>
              <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-[var(--color-primary)]">
                {pendingIntakes.length === 1 ? "Analisar cadastro" : "Ver cadastros"}
                <IconChevronRight className="h-4 w-4" />
              </span>
            </span>
          </Link>
        ) : null}
      </header>

      <div className="flex gap-2">
        {(
          [
            ["active", "Ativos"],
            ["archived", "Arquivados"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={statusFilter === value}
            className={`min-h-11 rounded-[var(--radius-md)] border px-3 text-sm font-semibold transition-colors ${
              statusFilter === value
                ? "border-[var(--color-primary)] bg-[var(--color-primary-subtle)] text-[var(--color-primary)]"
                : "border-[var(--color-border)] text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-subtle)]"
            }`}
            onClick={() => setStatusFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {showSearch ? (
        <label className="block">
          <span className="sr-only">Buscar {terms.client}</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Buscar ${terms.client}`}
            className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm"
          />
        </label>
      ) : null}

      {loading ? <p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p> : null}
      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}

      {!loading && !items.length ? (
        <EmptyState
          title={emptyTitle}
          description={`Cadastre um ${terms.client} manualmente ou envie um convite para ele preencher os dados.`}
        />
      ) : null}

      <ul className="space-y-2.5 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0 xl:grid-cols-3">
        {visible.map((item) => {
          const row = clientListPresentation(item, cycles, today, terms);
          return (
            <li key={item.id} className="lg:h-full">
              <Link
                href={`/app/clients/${item.id}`}
                className="flex min-h-16 items-center gap-3.5 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 shadow-sm transition-all hover:-translate-y-px hover:shadow-md lg:h-full"
              >
                <span
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-subtle)] text-sm font-semibold text-[var(--color-primary)]"
                  aria-hidden
                >
                  {clientInitials(item.full_name) || <IconUser className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-[var(--color-ink)]">
                    {item.full_name}
                  </span>
                  <span className="block truncate text-sm text-[var(--color-ink-muted)]">
                    {row.subtitle}
                  </span>
                </span>
                <span
                  className={[
                    "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    row.badge.tone === "warning"
                      ? "bg-[var(--color-warning-subtle)] text-[var(--color-warning)]"
                      : row.badge.tone === "muted"
                        ? "bg-[var(--color-surface-subtle)] text-[var(--color-ink-muted)]"
                        : "bg-[var(--color-success-subtle)] text-[var(--color-success)]",
                  ].join(" ")}
                >
                  {row.badge.label}
                </span>
                <IconChevronRight className="h-4 w-4 shrink-0 text-[var(--color-ink-subtle)]" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
