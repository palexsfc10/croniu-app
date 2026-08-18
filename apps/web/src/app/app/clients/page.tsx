"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  apiFetch,
  type Client,
  type Cycle,
  type HomeSummary,
  type IntakeLink,
  type ProfessionProfile,
} from "@/lib/api";
import { nomenclatureFor } from "@/lib/nomenclature";
import { clientInitials, clientListPresentation } from "@/lib/client-list";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  IconChevronRight,
  IconLink,
  IconPlus,
  IconUser,
  IconWhatsApp,
} from "@/components/ui/icons";

function ShareLinkButton({
  variant = "secondary",
  intakeFormLabel,
}: {
  variant?: "primary" | "secondary";
  intakeFormLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [link, setLink] = useState<IntakeLink | null>(null);
  const [rawToken, setRawToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  async function ensureLoaded() {
    if (loaded) return;
    const res = await apiFetch<IntakeLink>("/api/v1/intake-link");
    if (res.data) setLink(res.data);
    setLoaded(true);
  }

  function publicUrl() {
    if (rawToken) return `${window.location.origin}/entrar/${rawToken}`;
    if (link?.public_url) return link.public_url;
    if (link?.public_path)
      return `${window.location.origin}${link.public_path}`;
    return null;
  }

  async function createLink() {
    setBusy(true);
    setInfo(null);
    const result = await apiFetch<IntakeLink>("/api/v1/intake-link", {
      method: "POST",
      body: "{}",
    });
    setBusy(false);
    if (result.error) {
      setInfo(result.error.message);
      return;
    }
    setLink(result.data ?? null);
    setRawToken(result.data?.token ?? null);
  }

  async function copyLink() {
    const url = publicUrl();
    if (!url) {
      setInfo("Crie o link para copiar.");
      return;
    }
    await navigator.clipboard.writeText(url);
    setInfo("Link copiado.");
  }

  function shareWhatsApp() {
    if (link?.wa_message_url) {
      window.open(link.wa_message_url, "_blank", "noopener,noreferrer");
      return;
    }
    const url = publicUrl();
    if (!url) {
      setInfo("Crie o link para compartilhar.");
      return;
    }
    const text = encodeURIComponent(
      `Olá! Complete o ${intakeFormLabel} neste link: ${url}`,
    );
    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="relative min-w-0">
      <Button
        variant={variant}
        className="min-h-11 whitespace-nowrap"
        aria-expanded={open}
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) void ensureLoaded();
        }}
      >
        <IconLink className="mr-1.5 h-4 w-4" />
        Compartilhar link
      </Button>
      {open ? (
        <div className="absolute left-0 z-20 mt-1 w-64 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-sm">
          {info ? (
            <p
              role="status"
              className="mb-2 text-xs text-[var(--color-ink-muted)]"
            >
              {info}
            </p>
          ) : null}
          {!loaded ? (
            <p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p>
          ) : !link?.has_active_link ? (
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
                WhatsApp
              </Button>
              <Link
                href="/app/clients/intake"
                className="block text-center text-xs text-[var(--color-ink-muted)] underline-offset-2 hover:underline"
              >
                Ver fila de cadastros
              </Link>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function ClientsPage() {
  const [items, setItems] = useState<Client[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [today, setToday] = useState("");
  const [intakeCount, setIntakeCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [profession, setProfession] = useState<ProfessionProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"active" | "archived">(
    "active",
  );
  const [query, setQuery] = useState("");
  const terms = nomenclatureFor(profession?.profession_code);
  const title = terms.clients.charAt(0).toUpperCase() + terms.clients.slice(1);
  const addLabel = `Adicionar ${terms.client}`;
  const emptyTitle = `Nenhum ${terms.client} cadastrado`;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const [result, prof, cycleRes, home] = await Promise.all([
        apiFetch<Client[]>(`/api/v1/clients?status=${statusFilter}`),
        apiFetch<ProfessionProfile>("/api/v1/organization/profession"),
        apiFetch<Cycle[]>("/api/v1/cycles"),
        apiFetch<HomeSummary>("/api/v1/home/summary"),
      ]);
      if (cancelled) return;
      if (result.error) setError(result.error.message);
      else {
        setError(null);
        setItems(result.data ?? []);
      }
      if (prof.data) setProfession(prof.data);
      setCycles(cycleRes.data ?? []);
      setToday(home.data?.local_today ?? "");
      setIntakeCount(home.data?.new_submissions_count ?? 0);
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
    <div className="space-y-4 animate-fade-up pb-4">
      <header className="space-y-3">
        <div>
          <h1 className="h-display text-3xl text-[var(--color-ink)]">
            {title}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            Pessoas que você atende, com o próximo passo à vista.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/app/clients/new" className="min-w-0">
            <Button className="min-h-11 whitespace-nowrap">
              <IconPlus className="mr-1.5 h-4 w-4" />
              {addLabel}
            </Button>
          </Link>
          <ShareLinkButton intakeFormLabel={terms.intake_form} />
        </div>
        {intakeCount > 0 ? (
          <Link
            href="/app/clients/intake"
            className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--color-primary)]"
          >
            {intakeCount === 1
              ? "1 cadastro para analisar"
              : `${intakeCount} cadastros para analisar`}
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
            className={`min-h-11 rounded-[var(--radius-md)] border px-3 text-sm font-semibold ${
              statusFilter === value
                ? "border-[var(--color-primary)] bg-[var(--color-primary-subtle)] text-[var(--color-primary)]"
                : "border-[var(--color-border)] text-[var(--color-ink-muted)]"
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

      {loading ? (
        <p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}

      {!loading && !items.length ? (
        <EmptyState
          title={emptyTitle}
          description="Adicione manualmente ou compartilhe seu link de cadastro."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link href="/app/clients/new">
                <Button className="min-h-11">{addLabel}</Button>
              </Link>
              <ShareLinkButton intakeFormLabel={terms.intake_form} />
            </div>
          }
        />
      ) : null}

      <ul className="space-y-2">
        {visible.map((item) => {
          const row = clientListPresentation(item, cycles, today, terms);
          return (
            <li key={item.id}>
              <Link
                href={`/app/clients/${item.id}`}
                className="flex min-h-14 items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 transition-colors hover:bg-[var(--color-surface-subtle)]"
              >
                <span
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-subtle)] text-sm font-semibold text-[var(--color-primary)]"
                  aria-hidden
                >
                  {clientInitials(item.full_name) || (
                    <IconUser className="h-4 w-4" />
                  )}
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
