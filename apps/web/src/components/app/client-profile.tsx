"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  apiFetch,
  type Client,
  type ClientAccess,
  type ClientJourney,
  type Cycle,
  type ProfessionProfile,
  type Protocol,
} from "@/lib/api";
import { nomenclatureFor, safeReturnTo, t } from "@/lib/nomenclature";
import {
  clientStatusLabel,
  formatPhoneBR,
  journeyStageLabel,
  nextActionLabel,
  protocolStatusLabel,
} from "@/lib/status-labels";
import { formatHumanDateRange } from "@/lib/date-format";
import { cycleListStatus } from "@/lib/cycle-period";
import { BackLink } from "@/components/app/back-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  IconClipboardList,
  IconHistory,
  IconLayers,
  IconRefreshCw,
} from "@/components/ui/icons";

type Tab = "resumo" | "acompanhamento" | "dados";

type Props = {
  clientId: string;
};

function addDaysIso(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function firstName(full: string) {
  return full.trim().split(/\s+/)[0] || full;
}

export function ClientProfile({ clientId }: Props) {
  const router = useRouter();
  const search = useSearchParams();
  const tab = (search.get("tab") as Tab) || "resumo";
  const [item, setItem] = useState<Client | null>(null);
  const [access, setAccess] = useState<ClientAccess | null>(null);
  const [journey, setJourney] = useState<ClientJourney | null>(null);
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [profession, setProfession] = useState<ProfessionProfile | null>(null);
  const [rawToken, setRawToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [portalNotice, setPortalNotice] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [todayIso, setTodayIso] = useState("2026-01-01");

  const terms = nomenclatureFor(profession?.profession_code);
  const returnAccomp = `/app/clients/${clientId}?tab=acompanhamento`;

  const load = useCallback(async () => {
    const [c, a, j, p, cy, pr, pref] = await Promise.all([
      apiFetch<Client>(`/api/v1/clients/${clientId}`),
      apiFetch<ClientAccess>(`/api/v1/clients/${clientId}/public-access`),
      apiFetch<ClientJourney>(`/api/v1/clients/${clientId}/journey`),
      apiFetch<Protocol[]>(`/api/v1/protocols?client_id=${clientId}`),
      apiFetch<Cycle[]>(`/api/v1/cycles?client_id=${clientId}`),
      apiFetch<ProfessionProfile>("/api/v1/organization/profession"),
      apiFetch<{ local_today: string }>("/api/v1/organization/preferences"),
    ]);
    if (c.error) setError(c.error.message);
    else setItem(c.data ?? null);
    if (a.data) setAccess(a.data);
    if (j.data) setJourney(j.data);
    if (p.data) setProtocols(p.data);
    if (cy.data) setCycles(cy.data);
    if (pr.data) setProfession(pr.data);
    if (pref.data?.local_today) setTodayIso(pref.data.local_today);
  }, [clientId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount/remote hydrate
    void load();
  }, [load]);

  function setTab(next: Tab) {
    router.replace(`/app/clients/${clientId}?tab=${next}`);
  }

  const published = protocols.find((p) => p.status === "published");
  const draft = protocols.find((p) => p.status === "draft");
  const activeCycle = cycles.find((c) => c.status === "active") ?? cycles[0];
  const stageLabel = journeyStageLabel(journey?.stage);
  const actionLabel =
    journey?.next_action_label || nextActionLabel(journey?.next_action);

  const next = (() => {
    const name = item ? firstName(item.full_name) : terms.client;
    if (!activeCycle) {
      return {
        title: "Próximo passo",
        text: `Configure o primeiro ciclo de ${name}.`,
        cta: "Criar ciclo",
        href: `/app/cycles/new?clientId=${clientId}&returnTo=${encodeURIComponent(returnAccomp)}`,
      };
    }
    const ending = published?.milestones?.find((m) => m.kind === "plan_ending");
    const review = published?.milestones?.find((m) => m.kind === "plan_review");
    if (ending && published && ending.due_on <= addDaysIso(todayIso, 7) && ending.due_on >= todayIso) {
      return {
        title: "Próximo passo",
        text: `O planejamento atual termina nesta semana.`,
        cta: t(terms, "plan_ending"),
        href: `/app/clients/${clientId}/plans/new?returnTo=${encodeURIComponent(returnAccomp)}`,
      };
    }
    if (review && published && review.due_on <= addDaysIso(todayIso, 7)) {
      return {
        title: "Próximo passo",
        text: `O ${t(terms, "plan")} de ${name} precisa ser revisado.`,
        cta: `Revisar ${t(terms, "plan_short")}`,
        href: `/app/clients/${clientId}/plans/${published.id}?returnTo=${encodeURIComponent(returnAccomp)}`,
      };
    }
    if (draft) {
      return {
        title: "Próximo passo",
        text: `Há um rascunho de ${t(terms, "plan")} para continuar.`,
        cta: "Continuar rascunho",
        href: `/app/clients/${clientId}/plans/${draft.id}?returnTo=${encodeURIComponent(returnAccomp)}`,
      };
    }
    if (
      journey?.stage === "approved" ||
      journey?.next_action === "prepare_accompaniment" ||
      journey?.next_action === "continue_onboarding"
    ) {
      return {
        title: "Próximo passo",
        text: `Prepare o acompanhamento de ${name}.`,
        cta: "Preparar acompanhamento",
        href: `/app/clients/${clientId}/accompaniment`,
      };
    }
    return {
      title: "Próximo passo",
      text: "Tudo organizado por enquanto.",
      cta: null as string | null,
      href: null as string | null,
    };
  })();

  async function archive() {
    if (!item || !window.confirm(`Arquivar ${item.full_name}?`)) return;
    setBusy(true);
    const result = await apiFetch<Client>(`/api/v1/clients/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "archived" }),
    });
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    router.replace("/app/clients");
  }

  async function createOrRotate(rotate: boolean) {
    if (rotate && !window.confirm("Gerar um novo acesso invalida o atual.")) return;
    const path = rotate
      ? `/api/v1/clients/${clientId}/public-access/rotate`
      : `/api/v1/clients/${clientId}/public-access`;
    const result = await apiFetch<ClientAccess>(path, { method: "POST", body: "{}" });
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setAccess(result.data ?? null);
    setRawToken(result.data?.token ?? null);
    setPortalNotice("Acesso gerado. Copie agora — o token completo não será mostrado novamente.");
  }

  async function copyAccess() {
    const url = rawToken
      ? access?.public_url || `${window.location.origin}/c/${rawToken}`
      : null;
    if (!url) {
      setPortalNotice("Gere um novo acesso para copiar o endereço completo.");
      return;
    }
    await navigator.clipboard.writeText(url);
    setPortalNotice("Acesso copiado.");
  }

  function shareWhatsApp() {
    const text = encodeURIComponent(
      "Acesse o portal Croniu para acompanhar agenda, ciclo e conteúdos publicados.",
    );
    const phone = (item?.phone || "").replace(/\D/g, "");
    window.open(
      phone ? `https://wa.me/55${phone}?text=${text}` : `https://wa.me/?text=${text}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "resumo", label: "Resumo" },
    { id: "acompanhamento", label: "Acompanhamento" },
    { id: "dados", label: "Dados" },
  ];

  return (
    <div className="space-y-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] animate-fade-up">
      <div className="flex items-center justify-between gap-2">
        <BackLink href="/app/clients" label={t(terms, "clients")} />
        <details
          className="relative"
          open={menuOpen}
          onToggle={(e) => setMenuOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary
            className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] text-lg"
            aria-label="Mais ações"
          >
            ⋯
          </summary>
          <div className="absolute right-0 z-20 mt-1 min-w-[14rem] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-sm">
            <Link
              href={`/app/clients/${clientId}?tab=dados`}
              className="block min-h-11 rounded px-2 py-2 text-sm"
            >
              Editar dados
            </Link>
            <button type="button" className="block w-full min-h-11 rounded px-2 py-2 text-left text-sm" onClick={() => void copyAccess()}>
              Copiar acesso
            </button>
            <button
              type="button"
              className="mt-1 block w-full min-h-11 rounded px-2 py-2 text-left text-sm text-[var(--color-danger)]"
              disabled={busy}
              onClick={() => void archive()}
            >
              Arquivar
            </button>
          </div>
        </details>
      </div>

      {item ? (
        <header className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
            {t(terms, "client")}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">
            {item.full_name}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="info">{clientStatusLabel(item.status) || stageLabel}</Badge>
            {next.cta ? (
              <p className="text-sm text-[var(--color-ink-muted)]">Próximo: {next.cta}</p>
            ) : null}
          </div>
        </header>
      ) : (
        <p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p>
      )}

      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}

      <div
        role="tablist"
        aria-label="Ficha"
        className="grid grid-cols-3 gap-1 rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] p-1"
      >
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            className="min-h-11 rounded-[var(--radius-sm)] px-2 text-sm font-medium text-[var(--color-ink-muted)] aria-selected:bg-[var(--color-surface)] aria-selected:text-[var(--color-ink)]"
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === "resumo" && item ? (
        <section className="space-y-3" aria-label="Resumo">
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-primary)]">
              {next.title}
            </p>
            <p className="mt-1 text-sm text-[var(--color-ink)]">{next.text}</p>
            {next.cta && next.href ? (
              <Link href={next.href} className="mt-3 inline-block">
                <Button>{next.cta}</Button>
              </Link>
            ) : null}
          </div>
          {activeCycle ? (
            <p className="text-sm text-[var(--color-ink-muted)]">
              Ciclo atual · {activeCycle.service_name || "Serviço"} ·{" "}
              {formatHumanDateRange(activeCycle.starts_on, activeCycle.ends_on)}
            </p>
          ) : null}
          {published ? (
            <p className="text-sm text-[var(--color-ink-muted)]">
              {t(terms, "plan")} vigente · {published.title} · {protocolStatusLabel(published.status)}
            </p>
          ) : null}
        </section>
      ) : null}

      {tab === "acompanhamento" && item ? (
        <section className="space-y-3" aria-label="Acompanhamento">
          <article className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-[0_1px_2px_rgba(15,15,20,0.04)]">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-surface-subtle)] text-[var(--color-ink-muted)]">
                <IconRefreshCw className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold">Ciclo atual</h2>
                    <p className="text-sm text-[var(--color-ink)]">
                      {activeCycle?.service_name || "Sem ciclo"}
                    </p>
                  </div>
                  {activeCycle ? (
                    <Badge tone="neutral">{cycleListStatus(activeCycle, todayIso)}</Badge>
                  ) : null}
                </div>
                {activeCycle ? (
                  <>
                    <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                      {formatHumanDateRange(activeCycle.starts_on, activeCycle.ends_on)}
                    </p>
                    {activeCycle.lesson_count != null ? (
                      <p className="text-sm text-[var(--color-ink-muted)]">
                        {activeCycle.lessons_completed ?? 0} de {activeCycle.lesson_count} aulas
                        realizadas
                      </p>
                    ) : null}
                    <Link href={`/app/cycles/${activeCycle.id}`} className="mt-2 inline-block">
                      <Button variant="secondary">Ver ciclo</Button>
                    </Link>
                  </>
                ) : (
                  <>
                    <p className="mt-1 text-sm text-[var(--color-ink-muted)]">Nenhum ciclo ainda.</p>
                    <Link
                      href={`/app/cycles/new?clientId=${clientId}&returnTo=${encodeURIComponent(returnAccomp)}`}
                      className="mt-2 inline-block"
                    >
                      <Button>Criar ciclo</Button>
                    </Link>
                  </>
                )}
              </div>
            </div>
          </article>

          <article className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-[0_1px_2px_rgba(15,15,20,0.04)]">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-surface-subtle)] text-[var(--color-ink-muted)]">
                <IconLayers className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold">{t(terms, "plan")}</h2>
                {published || draft ? (
                  <>
                    <p className="text-sm text-[var(--color-ink)]">{(published || draft)?.title}</p>
                    <p className="text-sm text-[var(--color-ink-muted)]">
                      {protocolStatusLabel((published || draft)?.status)}
                      {(published || draft)?.duration_value
                        ? ` · ${(published || draft)?.duration_value} semanas`
                        : ""}
                    </p>
                    {draft ? (
                      <Link
                        href={`/app/clients/${clientId}/plans/${draft.id}?returnTo=${encodeURIComponent(returnAccomp)}`}
                        className="mt-2 inline-block"
                      >
                        <Button variant="secondary">Continuar rascunho</Button>
                      </Link>
                    ) : published ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Link
                          href={`/app/clients/${clientId}/plans/${published.id}?returnTo=${encodeURIComponent(returnAccomp)}`}
                        >
                          <Button variant="secondary">Ver plano</Button>
                        </Link>
                        <details>
                          <summary className="cursor-pointer text-sm text-[var(--color-ink-muted)]">
                            Mais
                          </summary>
                          <Link
                            href={`/app/clients/${clientId}/plans/new?returnTo=${encodeURIComponent(returnAccomp)}`}
                            className="mt-1 block text-sm"
                          >
                            Nova versão
                          </Link>
                        </details>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <>
                    <p className="text-sm text-[var(--color-ink-muted)]">Plano ainda não criado</p>
                    <Link
                      href={`/app/clients/${clientId}/plans/new?returnTo=${encodeURIComponent(returnAccomp)}`}
                      className="mt-2 inline-block"
                    >
                      <Button>Criar plano</Button>
                    </Link>
                  </>
                )}
              </div>
            </div>
          </article>

          <article className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-[0_1px_2px_rgba(15,15,20,0.04)]">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-surface-subtle)] text-[var(--color-ink-muted)]">
                <IconClipboardList className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold">Avaliações</h2>
                <p className="text-sm text-[var(--color-ink)]">Nenhuma avaliação registrada</p>
                <p className="text-sm text-[var(--color-ink-muted)]">
                  Registre o ponto de partida quando fizer sentido.
                </p>
                <Link
                  href={`/app/clients/${clientId}/evaluations/new?returnTo=${encodeURIComponent(returnAccomp)}`}
                  className="mt-2 inline-block"
                >
                  <Button variant="secondary">Nova avaliação</Button>
                </Link>
              </div>
            </div>
          </article>

          <article className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-[0_1px_2px_rgba(15,15,20,0.04)]">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-surface-subtle)] text-[var(--color-ink-muted)]">
                <IconHistory className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold">Rotinas</h2>
                <p className="text-sm text-[var(--color-ink-muted)]">Rotina configurada no quadro.</p>
                <Link href={`/app/routines?returnTo=${encodeURIComponent(returnAccomp)}`} className="mt-2 inline-block">
                  <Button variant="secondary">Ver rotinas</Button>
                </Link>
              </div>
            </div>
          </article>
        </section>
      ) : null}

      {tab === "dados" && item ? (
        <section className="space-y-4" aria-label="Dados">
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-[var(--color-ink-muted)]">Telefone</dt>
              <dd className="flex flex-wrap items-center gap-2">
                {formatPhoneBR(item.phone)}
                {item.phone ? (
                  <a
                    className="text-sm font-medium text-[var(--color-link)]"
                    href={`https://wa.me/55${item.phone.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    WhatsApp
                  </a>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--color-ink-muted)]">E-mail</dt>
              <dd>{item.email || "—"}</dd>
            </div>
            <div>
              <dt className="text-[var(--color-ink-muted)]">Observações</dt>
              <dd>{item.notes || "—"}</dd>
            </div>
          </dl>

          <div className="space-y-2">
            <h2 className="text-sm font-semibold">Portal do cliente</h2>
            {portalNotice ? (
              <p role="status" className="text-sm text-[var(--color-ink-muted)]">
                {portalNotice}
              </p>
            ) : null}
            <p className="text-sm text-[var(--color-ink-muted)]">
              Compartilhe este acesso para que o cliente acompanhe agenda, ciclo e conteúdos
              publicados.
            </p>
            <div className="flex flex-wrap gap-2">
              {!access?.has_active_link ? (
                <Button onClick={() => void createOrRotate(false)}>Criar acesso</Button>
              ) : (
                <>
                  <Button onClick={() => void copyAccess()}>Copiar acesso</Button>
                  <Button variant="secondary" onClick={shareWhatsApp}>
                    Compartilhar no WhatsApp
                  </Button>
                </>
              )}
            </div>
            <details className="text-sm">
              <summary className="cursor-pointer text-[var(--color-ink-muted)]">Mais opções</summary>
              <div className="mt-2 flex flex-col gap-2">
                <Button variant="ghost" onClick={() => void createOrRotate(true)}>
                  Gerar novo acesso
                </Button>
              </div>
            </details>
          </div>
        </section>
      ) : null}

      {actionLabel && tab === "resumo" && journey?.requires_professional_attention ? (
        <p className="text-sm text-[var(--color-warning)]">Há pendências de cadastro para revisar.</p>
      ) : null}
      <span className="hidden">{safeReturnTo(returnAccomp)}</span>
    </div>
  );
}
