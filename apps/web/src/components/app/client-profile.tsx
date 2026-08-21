"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import {
  apiFetch,
  type ClientEvaluation,
  type Client,
  type ClientAccess,
  type ClientJourney,
  type Cycle,
  type Protocol,
} from "@/lib/api";
import { useAuth } from "@/components/auth/auth-provider";
import { nomenclatureFor, safeReturnTo, t } from "@/lib/nomenclature";
import { EmptyStateGuide } from "@/components/ui/empty-state-guide";
import {
  clientStatusLabel,
  formatPhoneBR,
  journeyStageLabel,
  nextActionLabel,
  protocolStatusLabel,
} from "@/lib/status-labels";
import { formatCycleVigencyCard } from "@/lib/date-format";
import { cycleListStatus, selectDisplayCycle } from "@/lib/cycle-period";
import { BackLink } from "@/components/app/back-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AccompanimentCard } from "@/components/app/accompaniment-card";
import { ClientPortalCard } from "@/components/app/client-portal-card";
import { copyTextToClipboard } from "@/lib/clipboard";
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
  const { me } = useAuth();
  const tab = (search.get("tab") as Tab) || "resumo";
  const [item, setItem] = useState<Client | null>(null);
  const [access, setAccess] = useState<ClientAccess | null>(null);
  const [journey, setJourney] = useState<ClientJourney | null>(null);
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [evaluations, setEvaluations] = useState<ClientEvaluation[]>([]);
  const [todayIso, setTodayIso] = useState("2026-01-01");
  const [routinePendingCount, setRoutinePendingCount] = useState<number | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);

  const terms = nomenclatureFor(me?.organization.profession_code);
  const returnAccomp = `/app/clients/${clientId}?tab=acompanhamento`;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [c, a, j, p, cy, pref, ev, rb, sub] = await Promise.all([
      apiFetch<Client>(`/api/v1/clients/${clientId}`),
      apiFetch<ClientAccess>(`/api/v1/clients/${clientId}/public-access`),
      apiFetch<ClientJourney>(`/api/v1/clients/${clientId}/journey`),
      apiFetch<Protocol[]>(`/api/v1/protocols?client_id=${clientId}`),
      apiFetch<Cycle[]>(`/api/v1/cycles?client_id=${clientId}`),
      apiFetch<{ local_today: string }>("/api/v1/organization/preferences"),
      apiFetch<ClientEvaluation[]>(`/api/v1/clients/${clientId}/evaluations`),
      apiFetch<{ groups: Array<{ occurrence_count?: number; count: number }> }>(
        `/api/v1/routines/board?client_id=${clientId}`,
      ),
      apiFetch<Array<{ id: string; submitted_at: string | null }>>(
        `/api/v1/intake-submissions?client_id=${clientId}`,
      ),
    ]);
    if (c.error) setError(c.error.message);
    else setItem(c.data ?? null);
    if (a.data) setAccess(a.data);
    if (j.error && !c.error) setError(j.error.message);
    if (j.data) setJourney(j.data);
    if (p.data) setProtocols(p.data);
    if (cy.data) setCycles(cy.data);
    if (pref.data?.local_today) setTodayIso(pref.data.local_today);
    if (ev.error && !c.error) setError(ev.error.message);
    if (ev.data) setEvaluations(ev.data);
    if (rb.data) {
      setRoutinePendingCount(
        rb.data.groups.reduce((sum, g) => sum + (g.occurrence_count ?? g.count), 0),
      );
    }
    if (sub.data?.length) setSubmissionId(sub.data[0].id);
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- remote hydrate
    void load();
  }, [load]);

  function setTab(next: Tab) {
    router.replace(`/app/clients/${clientId}?tab=${next}`);
  }

  function onTabKey(event: KeyboardEvent<HTMLDivElement>) {
    const idx = tabs.findIndex((entry) => entry.id === tab);
    if (idx < 0) return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const delta = event.key === "ArrowRight" ? 1 : -1;
      const next = tabs[(idx + delta + tabs.length) % tabs.length];
      setTab(next.id);
    }
  }

  const published = protocols.find((p) => p.status === "published");
  const draft = protocols.find((p) => p.status === "draft");
  const activeCycle = selectDisplayCycle(cycles, todayIso);
  const stageLabel = journeyStageLabel(journey?.stage);
  const actionLabel =
    journey?.next_action_label || nextActionLabel(journey?.next_action);

  const next = (() => {
    const name = item ? firstName(item.full_name) : terms.client;
    const prepareHref = `/app/clients/${clientId}/accompaniment`;
    const action = journey?.next_action;
    if (action === "organize_agenda") {
      return {
        title: "Próximo passo",
        isPending: true,
        text: `Organize a agenda do ciclo de ${name}.`,
        cta: journey?.next_action_label || "Organizar agenda",
        href: `/app/agenda?clientId=${clientId}`,
      };
    }
    if (action === "create_cycle") {
      return {
        title: "Próximo passo",
        isPending: true,
        text: `Configure o ciclo de ${name}.`,
        cta: "Criar ciclo",
        href: `/app/cycles/new?clientId=${clientId}&returnTo=${encodeURIComponent(returnAccomp)}`,
      };
    }
    if (
      action === "review_anamnesis" ||
      action === "register_evaluation" ||
      action === "create_plan" ||
      action === "configure_routine" ||
      action === "activate_accompaniment" ||
      action === "prepare_accompaniment" ||
      action === "continue_onboarding"
    ) {
      const checklist = journey?.accompaniment_checklist ?? {};
      const stepLabels: Record<string, string> = {
        anamnesis: terms.intake_form,
        evaluation: t(terms, "evaluation"),
        plan: t(terms, "plan"),
        cycle: "ciclo",
        agenda: "agenda",
        routine: "rotina",
      };
      const pending = ["anamnesis", "evaluation", "plan", "cycle", "agenda", "routine"].filter(
        (key) => !checklist[key] || checklist[key] === "todo",
      );
      const pendingText = pending.length
        ? ` Falta: ${pending.map((key) => stepLabels[key]).join(", ")}.`
        : "";
      return {
        title: "Próximo passo",
        isPending: true,
        text: `Continue a preparação de ${name}.${pendingText}`,
        cta: journey?.next_action_label || "Preparar acompanhamento",
        href: prepareHref,
      };
    }
    // No standalone "sem ciclo ativo" fallback here: whether a cycle is
    // still pending is exactly what the checklist-driven `create_cycle`
    // branch above already answers, from the same source of truth used by
    // the preparation checklist itself. A client whose cycle step was
    // explicitly resolved "não se aplica" has no active cycle either, and
    // duplicating that check here would contradict the checklist by asking
    // the professional to create a cycle they already said didn't apply.
    const ending = published?.milestones?.find((m) => m.kind === "plan_ending");
    const review = published?.milestones?.find((m) => m.kind === "plan_review");
    if (ending && published && ending.due_on <= addDaysIso(todayIso, 7) && ending.due_on >= todayIso) {
      return {
        title: "Próximo passo",
        isPending: true,
        text: `O planejamento atual termina nesta semana.`,
        cta: t(terms, "plan_ending"),
        href: `/app/clients/${clientId}/plans/new?returnTo=${encodeURIComponent(returnAccomp)}`,
      };
    }
    if (review && published && review.due_on <= addDaysIso(todayIso, 7)) {
      return {
        title: "Próximo passo",
        isPending: true,
        text: `O ${t(terms, "plan")} de ${name} precisa ser revisado.`,
        cta: `Revisar ${t(terms, "plan_short")}`,
        href: `/app/clients/${clientId}/plans/${published.id}?returnTo=${encodeURIComponent(returnAccomp)}`,
      };
    }
    if (draft) {
      return {
        title: "Próximo passo",
        isPending: true,
        text: `Há um rascunho de ${t(terms, "plan")} para continuar.`,
        cta: "Continuar rascunho",
        href: `/app/clients/${clientId}/plans/${draft.id}?returnTo=${encodeURIComponent(returnAccomp)}`,
      };
    }
    // Every checklist-driven and operational branch above already covers
    // "there's something to do." Reaching here means the preparation
    // checklist has nothing pending (journey.next_action is authoritatively
    // null — see backend/app/services/accompaniment.py) and no plan
    // ending/review/draft needs attention either: there is genuinely no
    // next step, so none is invented. `journey` existing at all means the
    // initial preparation ran its course at some point (real state, not a
    // guess) — that's worth naming explicitly instead of a generic filler.
    if (journey) {
      return {
        title: "Acompanhamento pronto",
        isPending: false,
        text: `A jornada inicial de ${name} está concluída.`,
        cta: "Ver acompanhamento",
        href: returnAccomp,
      };
    }
    return {
      title: "Próximo passo",
      isPending: false,
      text: `Tudo em dia com ${name}.`,
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

  async function copyMenuAccess() {
    const url = access?.has_active_link ? access.public_url ?? null : null;
    if (!url) {
      setTab("dados");
      setMenuOpen(false);
      return;
    }
    const result = await copyTextToClipboard(url);
    setMenuOpen(false);
    if (!result.ok) {
      setError("Não foi possível copiar automaticamente. Abra Dados para copiar o endereço.");
    }
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
            {access?.has_active_link && access.public_url ? (
              <button
                type="button"
                className="block w-full min-h-11 rounded px-2 py-2 text-left text-sm"
                onClick={() => void copyMenuAccess()}
              >
                Copiar acesso
              </button>
            ) : (
              <button
                type="button"
                className="block w-full min-h-11 rounded px-2 py-2 text-left text-sm"
                onClick={() => {
                  setTab("dados");
                  setMenuOpen(false);
                }}
              >
                Criar acesso
              </button>
            )}
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
            {next.isPending && next.cta ? (
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
        onKeyDown={onTabKey}
        className="grid h-12 w-full grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1fr)] items-stretch gap-0.5 rounded-[var(--radius-md)] border border-[var(--color-border)]/60 bg-[var(--color-surface-subtle)] p-0.5 shadow-[inset_0_1px_2px_rgba(15,15,20,0.04)] max-[360px]:h-12"
      >
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            id={`ficha-tab-${entry.id}`}
            aria-selected={tab === entry.id}
            aria-controls={`ficha-panel-${entry.id}`}
            tabIndex={tab === entry.id ? 0 : -1}
            className="flex min-h-11 min-w-0 items-center justify-center rounded-[10px] px-1 text-center text-[13px] font-medium leading-tight text-[var(--color-ink-muted)] whitespace-nowrap transition-all duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-primary)] aria-selected:bg-[var(--color-surface)] aria-selected:font-semibold aria-selected:text-[var(--color-ink)] aria-selected:shadow-[0_1px_3px_rgba(15,15,20,0.08)] max-[360px]:text-xs"
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === "resumo" ? (
        <section
          id="ficha-panel-resumo"
          role="tabpanel"
          aria-labelledby="ficha-tab-resumo"
          className="min-h-[8rem] space-y-3"
          aria-label="Resumo"
        >
          {loading && !item ? (
            <p className="text-sm text-[var(--color-ink-muted)]">Carregando resumo…</p>
          ) : item ? (
            <>
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
              {formatCycleVigencyCard(activeCycle.starts_on, activeCycle.ends_on).range}
              <span className="block">
                {formatCycleVigencyCard(activeCycle.starts_on, activeCycle.ends_on).renewal}
              </span>
            </p>
          ) : null}
          {published ? (
            <p className="text-sm text-[var(--color-ink-muted)]">
              {t(terms, "plan")} vigente · {published.title} · {protocolStatusLabel(published.status)}
            </p>
          ) : null}
            </>
          ) : (
            <EmptyStateGuide
              title="Não foi possível abrir o resumo"
              body={error || "Tente novamente."}
              action={
                <Button type="button" onClick={() => void load()}>
                  Tentar novamente
                </Button>
              }
            />
          )}
        </section>
      ) : null}

      {tab === "acompanhamento" ? (
        <section
          id="ficha-panel-acompanhamento"
          role="tabpanel"
          aria-labelledby="ficha-tab-acompanhamento"
          className="min-h-[16rem] space-y-3"
          aria-label="Acompanhamento"
        >
          {loading && !item ? (
            <div className="space-y-3" aria-busy="true" data-testid="accompaniment-skeleton">
              <div className="h-24 animate-pulse rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)]" />
              <div className="h-24 animate-pulse rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)]" />
            </div>
          ) : (
            <>
          {error ? (
            <EmptyStateGuide
              title="Não foi possível carregar o acompanhamento"
              body={error}
              action={
                <Button type="button" onClick={() => void load()}>
                  Tentar novamente
                </Button>
              }
            />
          ) : null}
          {next.isPending && next.cta && next.href ? (
            <EmptyStateGuide
              title="Próxima ação"
              body={next.text}
              action={
                <Link href={next.href}>
                  <Button>{next.cta}</Button>
                </Link>
              }
            />
          ) : null}
          <AccompanimentCard
            icon={<IconRefreshCw className="h-5 w-5" />}
            title="Ciclo atual"
            state={activeCycle ? cycleListStatus(activeCycle, todayIso) : "Vazio"}
            summary={activeCycle?.service_name || "Sem ciclo"}
            detail={
              activeCycle
                ? [
                    formatCycleVigencyCard(activeCycle.starts_on, activeCycle.ends_on).range,
                    formatCycleVigencyCard(activeCycle.starts_on, activeCycle.ends_on).renewal,
                    activeCycle.lesson_count != null
                      ? `${activeCycle.lessons_completed ?? 0} de ${activeCycle.lesson_count} aulas realizadas`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : "Nenhum ciclo ainda."
            }
            progress={
              activeCycle?.lesson_count
                ? { value: activeCycle.lessons_completed ?? 0, max: activeCycle.lesson_count }
                : null
            }
            primary={
              activeCycle
                ? { href: `/app/cycles/${activeCycle.id}`, label: "Ver ciclo", variant: "secondary" }
                : {
                    href: `/app/cycles/new?clientId=${clientId}&returnTo=${encodeURIComponent(returnAccomp)}`,
                    label: "Criar ciclo",
                    variant: "primary",
                  }
            }
          />
          <AccompanimentCard
            icon={<IconLayers className="h-5 w-5" />}
            testId="accompaniment-plan-card"
            title={t(terms, "plan")}
            state={published || draft ? protocolStatusLabel((published || draft)?.status) : "Vazio"}
            summary={(published || draft)?.title || "Plano ainda não criado"}
            detail={
              (published || draft)?.duration_value
                ? `${(published || draft)?.duration_value} semanas`
                : undefined
            }
            primary={
              draft
                ? {
                    href: `/app/clients/${clientId}/plans/${draft.id}?returnTo=${encodeURIComponent(returnAccomp)}`,
                    label: "Continuar rascunho",
                    variant: "secondary",
                  }
                : published
                  ? {
                      href: `/app/clients/${clientId}/plans/${published.id}?returnTo=${encodeURIComponent(returnAccomp)}`,
                      label: "Ver plano",
                      variant: "secondary",
                    }
                  : {
                      href: `/app/clients/${clientId}/plans/new?returnTo=${encodeURIComponent(returnAccomp)}`,
                      label: "Criar plano",
                      variant: "primary",
                    }
            }
            extras={
              published
                ? [
                    {
                      href: `/app/clients/${clientId}/plans/new?returnTo=${encodeURIComponent(returnAccomp)}`,
                      label: "Nova versão",
                    },
                  ]
                : []
            }
          />
          <AccompanimentCard
            icon={<IconClipboardList className="h-5 w-5" />}
            title="Avaliações"
            state={
              evaluations[0]
                ? `${protocolStatusLabel(evaluations[0].status)} · ${evaluations.length}`
                : "Vazio"
            }
            summary={
              evaluations[0]?.title || "Nenhuma avaliação registrada"
            }
            detail={
              evaluations.length
                ? "A última avaliação aparece aqui. O cliente só vê o que você publicar."
                : "Registre o ponto de partida quando fizer sentido."
            }
            primary={
              evaluations[0]
                ? {
                    href: `/app/clients/${clientId}/evaluations/${evaluations[0].id}?returnTo=${encodeURIComponent(returnAccomp)}`,
                    label: "Ver avaliação",
                    variant: "secondary",
                  }
                : {
                    href: `/app/clients/${clientId}/evaluations/new?returnTo=${encodeURIComponent(returnAccomp)}`,
                    label: "Nova avaliação",
                    variant: "secondary",
                  }
            }
          />
          <AccompanimentCard
            icon={<IconHistory className="h-5 w-5" />}
            title="Rotinas"
            state={
              routinePendingCount === null
                ? null
                : routinePendingCount > 0
                  ? `${routinePendingCount} pendente${routinePendingCount === 1 ? "" : "s"}`
                  : "Em dia"
            }
            summary={
              routinePendingCount
                ? `${routinePendingCount} ocorrência${routinePendingCount === 1 ? "" : "s"} aguardando ação.`
                : "Nenhuma pendência de rotina para este aluno agora."
            }
            primary={{
              href: `/app/routines/pending?clientId=${clientId}&returnTo=${encodeURIComponent(returnAccomp)}`,
              label: "Ver rotinas",
              variant: "secondary",
            }}
          />
            </>
          )}
        </section>
      ) : null}

      {tab === "dados" && item ? (
        <section
          id="ficha-panel-dados"
          role="tabpanel"
          aria-labelledby="ficha-tab-dados"
          className="space-y-4"
          aria-label="Dados"
        >
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

          {submissionId ? (
            <Link
              href={`/app/clients/intake/${submissionId}`}
              className="flex min-h-11 items-center justify-between rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3"
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[var(--color-ink)]">
                  {terms.intake_form.charAt(0).toUpperCase() + terms.intake_form.slice(1)}
                </span>
                <span className="block text-sm text-[var(--color-ink-muted)]">
                  Respostas enviadas no cadastro
                </span>
              </span>
              <span className="shrink-0 text-sm font-medium text-[var(--color-link)]">Ver</span>
            </Link>
          ) : null}

          <ClientPortalCard
            clientId={clientId}
            firstName={firstName(item.full_name)}
            phone={item.phone}
            access={access}
            onAccessChange={setAccess}
            onFeedback={(message, tone) => {
              if (tone === "error" && message) setError(message);
              else if (!message) setError(null);
            }}
          />
        </section>
      ) : null}

      {actionLabel && tab === "resumo" && journey?.requires_professional_attention ? (
        <p className="text-sm text-[var(--color-warning)]">Há pendências de cadastro para revisar.</p>
      ) : null}
      <span className="hidden">{safeReturnTo(returnAccomp)}</span>
    </div>
  );
}
