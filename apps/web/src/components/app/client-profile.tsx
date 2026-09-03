"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import {
  apiFetch,
  formatBRL,
  formatDateBR,
  formatOrgDate,
  formatOrgDateTime,
  type Appointment,
  type ClientEvaluation,
  type Client,
  type ClientAccess,
  type ClientJourney,
  type Cycle,
  type Protocol,
  type Receivable,
} from "@/lib/api";
import { useAuth } from "@/components/auth/auth-provider";
import { nomenclatureFor, safeReturnTo, t } from "@/lib/nomenclature";
import { EmptyStateGuide } from "@/components/ui/empty-state-guide";
import {
  clientStatusLabel,
  clientStatusTone,
  formatPhoneBR,
  initials,
  journeyStageLabel,
  nextActionLabel,
  protocolStatusLabel,
} from "@/lib/status-labels";
import { receivableStatusLabel, receivableStatusTone } from "@/lib/status-tone";
import { formatCycleVigencyCard, formatHumanDate } from "@/lib/date-format";
import { cycleListStatus, cycleListStatusTone, selectDisplayCycle } from "@/lib/cycle-period";
import { buildCycleRow, renewalTarget } from "@/lib/cycle-central";
import { isReceivableOverdue, isReceivablePending } from "@/lib/client-list";
import { receivableActionLabel } from "@/lib/financial-central";
import { protocolStatusTone } from "@/lib/status-tone";
import { BackLink } from "@/components/app/back-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AccompanimentCard } from "@/components/app/accompaniment-card";
import { ClientIntakeInviteButton } from "@/components/app/client-intake-invite-button";
import { ClientPortalCard } from "@/components/app/client-portal-card";
import { ActionSheet } from "@/components/ui/action-sheet";
import { TextArea } from "@/components/ui/text-area";
import { copyTextToClipboard } from "@/lib/clipboard";
import {
  IconCalendarDays,
  IconCalendarPlus,
  IconChevronDown,
  IconClipboardList,
  IconExternalLink,
  IconLayers,
  IconPlus,
  IconRefreshCw,
  IconSparkles,
} from "@/components/ui/icons";

type Tab = "resumo" | "agenda" | "plano" | "prontuario" | "financeiro" | "historico";

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

function ReceivableGroup({
  title,
  items,
  today,
}: {
  title: string;
  items: Receivable[];
  today: string;
}) {
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
        {title} <span className="text-[var(--color-ink-muted)]">{items.length}</span>
      </h3>
      <ul className="divide-y divide-[var(--color-border)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)]/80 bg-[var(--color-surface)] shadow-sm">
        {items.map((r) => {
          const overdue = isReceivableOverdue(r, today);
          return (
            <li key={r.id} className="flex items-center justify-between gap-3 px-3.5 py-3">
              <Link
                href={`/app/receivables/${r.id}?returnTo=${encodeURIComponent(`/app/clients/${r.client_id}?tab=financeiro`)}`}
                className="min-w-0 flex-1 hover:underline"
              >
                <span className="block text-sm font-semibold text-[var(--color-ink)]">
                  {formatBRL(r.amount_cents)}
                </span>
                <span className="block text-sm text-[var(--color-ink-muted)]">
                  {r.status === "received"
                    ? `Recebido ${r.paid_at ? formatDateBR(r.paid_at.slice(0, 10)) : ""}`
                    : `Vencimento ${formatDateBR(r.due_on)}`}
                  {r.cycle_service_name ? ` · ${r.cycle_service_name}` : ""}
                </span>
              </Link>
              <div className="flex shrink-0 items-center gap-2">
                <Badge tone={receivableStatusTone(r.status, overdue)}>
                  {overdue ? "Vencido" : receivableStatusLabel(r.status)}
                </Badge>
                <Link
                  href={`/app/receivables/${r.id}?returnTo=${encodeURIComponent(`/app/clients/${r.client_id}?tab=financeiro`)}`}
                  className="text-sm font-medium text-[var(--color-primary)] hover:underline"
                >
                  {receivableActionLabel(r)}
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const TABS: { id: Tab; label: string }[] = [
  { id: "resumo", label: "Resumo" },
  { id: "agenda", label: "Agenda" },
  { id: "plano", label: "Plano e ciclo" },
  { id: "prontuario", label: "Prontuário" },
  { id: "financeiro", label: "Financeiro" },
  { id: "historico", label: "Histórico" },
];

export function ClientProfile({ clientId }: Props) {
  const router = useRouter();
  const search = useSearchParams();
  const { me } = useAuth();
  const timeZone = me?.organization.timezone || "America/Sao_Paulo";
  const rawTab = search.get("tab");
  const tab: Tab = TABS.some((entry) => entry.id === rawTab) ? (rawTab as Tab) : "resumo";
  const [item, setItem] = useState<Client | null>(null);
  const [justCreatedCycle, setJustCreatedCycle] = useState(false);
  const [access, setAccess] = useState<ClientAccess | null>(null);
  const [journey, setJourney] = useState<ClientJourney | null>(null);
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [noteSheetOpen, setNoteSheetOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [noteSaved, setNoteSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [evaluations, setEvaluations] = useState<ClientEvaluation[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [todayIso, setTodayIso] = useState("2026-01-01");
  const [routinePendingCount, setRoutinePendingCount] = useState<number | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);

  const terms = nomenclatureFor(me?.organization.profession_code);
  const returnResumo = `/app/clients/${clientId}`;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [c, a, j, p, cy, pref, ev, rb, sub, appts, recv] = await Promise.all([
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
      apiFetch<Appointment[]>(`/api/v1/clients/${clientId}/appointments?limit=10`),
      apiFetch<Receivable[]>(`/api/v1/clients/${clientId}/receivables`),
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
    if (appts.data) setAppointments(appts.data);
    if (recv.data) setReceivables(recv.data);
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- remote hydrate
    void load();
  }, [load]);

  useEffect(() => {
    if (search.get("done") !== "cycle") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time mount marker
    setJustCreatedCycle(true);
    const params = new URLSearchParams(search.toString());
    params.delete("done");
    const qs = params.toString();
    router.replace(`/app/clients/${clientId}${qs ? `?${qs}` : ""}`);
    // Runs once against the URL this page mounted with — stripping "done"
    // must not re-trigger itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setTab(next: Tab) {
    router.replace(`/app/clients/${clientId}?tab=${next}`);
  }

  function onTabKey(event: KeyboardEvent<HTMLDivElement>) {
    const idx = TABS.findIndex((entry) => entry.id === tab);
    if (idx < 0) return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const delta = event.key === "ArrowRight" ? 1 : -1;
      const next = TABS[(idx + delta + TABS.length) % TABS.length];
      setTab(next.id);
    }
  }

  const published = protocols.find((p) => p.status === "published");
  const draft = protocols.find((p) => p.status === "draft");
  const activeCycle = selectDisplayCycle(cycles, todayIso);
  const stageLabel = journeyStageLabel(journey?.stage);
  const actionLabel = journey?.next_action_label || nextActionLabel(journey?.next_action);
  const nextAppointment = appointments[0] ?? null;
  const pendingReceivables = receivables.filter(isReceivablePending);
  const overdueReceivables = receivables.filter((r) => isReceivableOverdue(r, todayIso));
  const pendingTotalCents = pendingReceivables.reduce((sum, r) => sum + r.amount_cents, 0);
  const overdueIds = new Set(overdueReceivables.map((r) => r.id));
  const futurePendingReceivables = pendingReceivables.filter((r) => !overdueIds.has(r.id));
  const receivedReceivables = receivables.filter((r) => r.status === "received");
  const receivedTotalCents = receivedReceivables.reduce((sum, r) => sum + r.amount_cents, 0);
  const latestEvaluation = evaluations[0] ?? null;
  const draftEvaluations = evaluations.filter((ev) => ev.status === "draft");
  const publishedEvaluations = evaluations.filter((ev) => ev.status === "published");
  const anamnesisDone = Boolean(journey?.anamnesis_reviewed_at);
  const prepareHref = `/app/clients/${clientId}/accompaniment`;

  // Renewal offer reuses the very same derivation as the Ciclos central, so a
  // cycle never looks renewable here and non-renewable there. It only ever
  // produces a link into the existing flow — clicking mutates nothing.
  const activeCycleRow = activeCycle
    ? buildCycleRow(activeCycle, {
        allCycles: cycles,
        receivables,
        nextAppointmentByClientId: nextAppointment
          ? { [clientId]: nextAppointment }
          : {},
        openRenewalCycleIds: new Set<string>(),
        today: todayIso,
      })
    : null;
  const cycleRenewalHref = activeCycleRow
    ? renewalTarget(activeCycleRow, `${returnResumo}?tab=plano`)
    : null;
  // Every other cycle of this client, newest first — the real contract history.
  const pastCycles = cycles
    .filter((c) => c.id !== activeCycle?.id)
    .sort((a, b) => b.starts_on.localeCompare(a.starts_on));

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
        href: `/app/cycles/new?clientId=${clientId}&returnTo=${encodeURIComponent(returnResumo)}`,
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
    const ending = published?.milestones?.find((m) => m.kind === "plan_ending");
    const review = published?.milestones?.find((m) => m.kind === "plan_review");
    if (ending && published && ending.due_on <= addDaysIso(todayIso, 7) && ending.due_on >= todayIso) {
      return {
        title: "Próximo passo",
        isPending: true,
        text: `O planejamento atual termina nesta semana.`,
        cta: t(terms, "plan_ending"),
        href: `/app/clients/${clientId}/plans/new?returnTo=${encodeURIComponent(returnResumo)}`,
      };
    }
    if (review && published && review.due_on <= addDaysIso(todayIso, 7)) {
      return {
        title: "Próximo passo",
        isPending: true,
        text: `O ${t(terms, "plan")} de ${name} precisa ser revisado.`,
        cta: `Revisar ${t(terms, "plan_short")}`,
        href: `/app/clients/${clientId}/plans/${published.id}?returnTo=${encodeURIComponent(returnResumo)}`,
      };
    }
    if (draft) {
      return {
        title: "Próximo passo",
        isPending: true,
        text: `Há um rascunho de ${t(terms, "plan")} para continuar.`,
        cta: "Continuar rascunho",
        href: `/app/clients/${clientId}/plans/${draft.id}?returnTo=${encodeURIComponent(returnResumo)}`,
      };
    }
    if (journey) {
      return {
        title: "Acompanhamento pronto",
        isPending: false,
        text: `A jornada inicial de ${name} está concluída.`,
        cta: null as string | null,
        href: null as string | null,
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

  async function reactivate() {
    if (!item) return;
    setBusy(true);
    const result = await apiFetch<Client>(`/api/v1/clients/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "active" }),
    });
    setBusy(false);
    setMenuOpen(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setItem(result.data ?? null);
  }

  async function copyMenuAccess() {
    const url = access?.has_active_link ? access.public_url ?? null : null;
    setMenuOpen(false);
    if (!url) return;
    const result = await copyTextToClipboard(url);
    if (!result.ok) {
      setError("Não foi possível copiar automaticamente. Abra Resumo para copiar o endereço.");
    }
  }

  function openNoteSheet() {
    setNoteDraft(item?.notes ?? "");
    setNoteError(null);
    setNoteSaved(false);
    setNoteSheetOpen(true);
  }

  async function saveNote() {
    if (!item) return;
    setNoteSaving(true);
    setNoteError(null);
    const result = await apiFetch<Client>(`/api/v1/clients/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ notes: noteDraft || null }),
    });
    setNoteSaving(false);
    if (result.error) {
      setNoteError(result.error.message);
      return;
    }
    setItem(result.data ?? item);
    setNoteSaved(true);
    window.setTimeout(() => setNoteSheetOpen(false), 700);
  }

  const alerts: string[] = [];
  if (journey?.requires_professional_attention) {
    alerts.push(journey.attention_note || "Há pendências de cadastro para revisar.");
  }
  if (routinePendingCount && routinePendingCount > 0) {
    alerts.push(
      `${routinePendingCount} ${routinePendingCount === 1 ? "rotina pendente" : "rotinas pendentes"}.`,
    );
  }
  if (overdueReceivables.length > 0) {
    alerts.push(
      `${overdueReceivables.length} ${overdueReceivables.length === 1 ? "cobrança atrasada" : "cobranças atrasadas"}.`,
    );
  }

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
            {access?.has_active_link && access.public_url ? (
              <a
                href={access.public_path ?? access.public_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-11 items-center gap-2 rounded-[var(--radius-sm)] px-2 py-2 text-sm transition-colors hover:bg-[var(--color-surface-subtle)] focus-visible:bg-[var(--color-surface-subtle)]"
                onClick={() => setMenuOpen(false)}
              >
                <IconExternalLink className="h-4 w-4" aria-hidden />
                Visualizar como cliente
              </a>
            ) : null}
            {access?.has_active_link && access.public_url ? (
              <button
                type="button"
                className="block w-full min-h-11 rounded-[var(--radius-sm)] px-2 py-2 text-left text-sm transition-colors hover:bg-[var(--color-surface-subtle)] focus-visible:bg-[var(--color-surface-subtle)]"
                onClick={() => void copyMenuAccess()}
              >
                Copiar acesso do portal
              </button>
            ) : (
              <button
                type="button"
                className="block w-full min-h-11 rounded-[var(--radius-sm)] px-2 py-2 text-left text-sm transition-colors hover:bg-[var(--color-surface-subtle)] focus-visible:bg-[var(--color-surface-subtle)]"
                onClick={() => {
                  setTab("resumo");
                  setMenuOpen(false);
                }}
              >
                Criar acesso do portal
              </button>
            )}
            {item?.status === "archived" ? (
              <button
                type="button"
                className="mt-1 block w-full min-h-11 rounded-[var(--radius-sm)] px-2 py-2 text-left text-sm transition-colors hover:bg-[var(--color-surface-subtle)] focus-visible:bg-[var(--color-surface-subtle)] disabled:pointer-events-none disabled:opacity-55"
                disabled={busy}
                onClick={() => void reactivate()}
              >
                Reativar
              </button>
            ) : (
              <button
                type="button"
                className="mt-1 block w-full min-h-11 rounded-[var(--radius-sm)] px-2 py-2 text-left text-sm text-[var(--color-danger)] transition-colors hover:bg-[var(--color-danger-subtle)] focus-visible:bg-[var(--color-danger-subtle)] disabled:pointer-events-none disabled:opacity-55"
                disabled={busy}
                onClick={() => void archive()}
              >
                Arquivar
              </button>
            )}
          </div>
        </details>
      </div>

      {item ? (
        <header className="flex items-start gap-3.5">
          <span
            aria-hidden
            className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-subtle)] text-base font-semibold text-[var(--color-primary)]"
          >
            {initials(item.full_name)}
          </span>
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
              {t(terms, "client")}
            </p>
            <h1 className="truncate text-2xl font-semibold tracking-tight text-[var(--color-ink)] md:text-[1.75rem]">
              {item.full_name}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={clientStatusTone(item.status)}>
                {clientStatusLabel(item.status) || stageLabel}
              </Badge>
              {next.isPending && next.cta ? (
                <p className="text-sm text-[var(--color-ink-muted)]">Próximo: {next.cta}</p>
              ) : null}
            </div>
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

      {justCreatedCycle ? (
        <p
          role="status"
          className="rounded-[var(--radius-md)] border border-[var(--color-success)]/25 bg-[var(--color-success-subtle)] px-3 py-2 text-sm font-medium text-[var(--color-success)]"
        >
          Ciclo criado com sucesso.
        </p>
      ) : null}

      {item ? (
        <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Ações do cliente">
          <Link
            href={`/app/appointments/new?clientId=${clientId}&returnTo=${encodeURIComponent(returnResumo)}`}
            className="shrink-0"
          >
            <Button variant="secondary" className="min-h-10 whitespace-nowrap px-3 text-sm">
              <IconCalendarPlus className="mr-1.5 h-4 w-4" aria-hidden />
              Agendar
            </Button>
          </Link>
          <Link
            href={`/app/clients/${clientId}/evaluations/new?returnTo=${encodeURIComponent(returnResumo)}`}
            className="shrink-0"
          >
            <Button variant="secondary" className="min-h-10 whitespace-nowrap px-3 text-sm">
              <IconClipboardList className="mr-1.5 h-4 w-4" aria-hidden />
              Registrar avaliação
            </Button>
          </Link>
          <Button
            type="button"
            variant="secondary"
            className="min-h-10 shrink-0 whitespace-nowrap px-3 text-sm"
            onClick={openNoteSheet}
          >
            <IconPlus className="mr-1.5 h-4 w-4" aria-hidden />
            Adicionar anotação
          </Button>
          <Link href={`/app/routines?clientId=${clientId}`} className="shrink-0">
            <Button variant="secondary" className="min-h-10 whitespace-nowrap px-3 text-sm">
              <IconRefreshCw className="mr-1.5 h-4 w-4" aria-hidden />
              Criar rotina
            </Button>
          </Link>
          <Link
            href={`/app/assistant?prompt=${encodeURIComponent(`Sobre ${item.full_name}: `)}&context=${encodeURIComponent(`Cliente: ${item.full_name}`)}&returnTo=${encodeURIComponent(returnResumo)}`}
            className="shrink-0"
          >
            <Button variant="secondary" className="min-h-10 whitespace-nowrap px-3 text-sm">
              <IconSparkles className="mr-1.5 h-4 w-4" aria-hidden />
              Perguntar sobre este cliente
            </Button>
          </Link>
          <Link href={`/app/clients/${clientId}/edit`} className="shrink-0">
            <Button variant="secondary" className="min-h-10 whitespace-nowrap px-3 text-sm">
              Editar
            </Button>
          </Link>
        </div>
      ) : null}

      {/* Desktop: full tabbed CRM view — never compressed onto mobile.
          Mobile gets its own consolidated, progressively-disclosed layout
          below instead of these same 6 tabs squeezed into a small screen. */}
      <div className="hidden lg:block">
      <div
        role="tablist"
        aria-label="Ficha"
        onKeyDown={onTabKey}
        className="flex h-12 w-full items-stretch gap-0.5 overflow-x-auto rounded-[var(--radius-md)] border border-[var(--color-border)]/60 bg-[var(--color-surface-subtle)] p-0.5 shadow-[inset_0_1px_2px_rgba(15,15,20,0.04)] lg:grid lg:grid-cols-6"
      >
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            id={`ficha-tab-${entry.id}`}
            aria-selected={tab === entry.id}
            aria-controls={`ficha-panel-${entry.id}`}
            tabIndex={tab === entry.id ? 0 : -1}
            className="flex min-h-11 min-w-0 shrink-0 items-center justify-center rounded-[10px] px-3 text-center text-[13px] font-medium leading-tight whitespace-nowrap text-[var(--color-ink-muted)] transition-all duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-primary)] aria-selected:bg-[var(--color-surface)] aria-selected:font-semibold aria-selected:text-[var(--color-ink)] aria-selected:shadow-[0_1px_3px_rgba(15,15,20,0.08)] lg:px-1 lg:text-[13px]"
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
          className="min-h-[8rem] space-y-4"
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

              {alerts.length > 0 ? (
                <div className="space-y-1.5 rounded-[var(--radius-md)] border border-[var(--color-warning)]/25 bg-[var(--color-warning-subtle)] p-3">
                  {alerts.map((text) => (
                    <p key={text} className="text-sm text-[var(--color-warning)]">
                      {text}
                    </p>
                  ))}
                </div>
              ) : null}

              {!submissionId ? (
                <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                  <p className="text-sm font-semibold text-[var(--color-ink)]">
                    Envie o formulário para {item.full_name.split(/\s+/)[0]} completar o cadastro.
                  </p>
                  <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                    Um convite individual, já com os dados que você cadastrou.
                  </p>
                  <div className="mt-3">
                    <ClientIntakeInviteButton clientId={clientId} />
                  </div>
                </div>
              ) : null}

              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
                    Contato
                  </dt>
                  <dd className="mt-1 text-sm text-[var(--color-ink)]">{formatPhoneBR(item.phone)}</dd>
                  <dd className="text-sm text-[var(--color-ink-muted)]">{item.email || "—"}</dd>
                </div>
                <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
                    Serviço e ciclo
                  </dt>
                  <dd className="mt-1 text-sm text-[var(--color-ink)]">
                    {activeCycle?.service_name || "Sem ciclo ativo"}
                  </dd>
                  {activeCycle ? (
                    <dd className="text-sm text-[var(--color-ink-muted)]">
                      {cycleListStatus(activeCycle, todayIso)}
                    </dd>
                  ) : null}
                </div>
                <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
                    Progresso
                  </dt>
                  <dd className="mt-1 text-sm tabular-nums text-[var(--color-ink)]">
                    {activeCycle?.lesson_count != null
                      ? `${activeCycle.lessons_completed ?? 0} de ${activeCycle.lesson_count} sessões`
                      : "—"}
                  </dd>
                </div>
                <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
                    Próxima sessão
                  </dt>
                  <dd className="mt-1 text-sm text-[var(--color-ink)]">
                    {nextAppointment
                      ? `${formatOrgDate(nextAppointment.starts_at, timeZone)} · ${formatOrgDateTime(nextAppointment.starts_at, timeZone, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}`
                      : "Sem agendamento"}
                  </dd>
                </div>
                <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
                    Última avaliação
                  </dt>
                  <dd className="mt-1 text-sm text-[var(--color-ink)]">
                    {latestEvaluation
                      ? `${protocolStatusLabel(latestEvaluation.status)} · ${formatDateBR((latestEvaluation.published_at || latestEvaluation.created_at).slice(0, 10))}`
                      : "Nenhuma registrada"}
                  </dd>
                </div>
                <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
                    Anamnese
                  </dt>
                  <dd className="mt-1 text-sm text-[var(--color-ink)]">
                    {anamnesisDone ? "Revisada" : submissionId ? "Aguardando revisão" : "Não enviada"}
                  </dd>
                </div>
                <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
                    Financeiro
                  </dt>
                  <dd className="mt-1 text-sm text-[var(--color-ink)]">
                    {pendingReceivables.length > 0 ? formatBRL(pendingTotalCents) : "Em dia"}
                  </dd>
                  {overdueReceivables.length > 0 ? (
                    <dd>
                      <Badge tone="danger">
                        {overdueReceivables.length}{" "}
                        {overdueReceivables.length === 1 ? "atrasada" : "atrasadas"}
                      </Badge>
                    </dd>
                  ) : null}
                </div>
                <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
                    Renovação
                  </dt>
                  <dd className="mt-1 text-sm text-[var(--color-ink)]">
                    {activeCycle?.is_nearing_end && activeCycle.days_remaining != null
                      ? `Em ${activeCycle.days_remaining} ${activeCycle.days_remaining === 1 ? "dia" : "dias"}`
                      : "—"}
                  </dd>
                </div>
                <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
                    Portal
                  </dt>
                  <dd className="mt-1 text-sm text-[var(--color-ink)]">
                    {access?.has_active_link ? "Acesso ativo" : "Sem acesso criado"}
                  </dd>
                </div>
                <Link
                  href={`/app/routines/pending?clientId=${clientId}&returnTo=${encodeURIComponent(returnResumo)}`}
                  className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 transition-colors hover:bg-[var(--color-surface-subtle)]"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
                    Rotinas
                  </p>
                  <p className="mt-1 text-sm text-[var(--color-ink)]">
                    {routinePendingCount
                      ? `${routinePendingCount} pendente${routinePendingCount === 1 ? "" : "s"}`
                      : "Em dia"}
                  </p>
                </Link>
              </dl>

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

      {tab === "agenda" ? (
        <section
          id="ficha-panel-agenda"
          role="tabpanel"
          aria-labelledby="ficha-tab-agenda"
          className="min-h-[8rem] space-y-3"
          aria-label="Agenda"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
              Próximas sessões
            </h2>
            <Link
              href={`/app/appointments/new?clientId=${clientId}&returnTo=${encodeURIComponent(`${returnResumo}?tab=agenda`)}`}
            >
              <Button variant="secondary" className="min-h-10 px-3 text-sm">
                <IconCalendarPlus className="mr-1.5 h-4 w-4" aria-hidden />
                Agendar
              </Button>
            </Link>
          </div>
          {appointments.length === 0 ? (
            <EmptyStateGuide
              title="Nenhuma sessão agendada"
              body="Este cliente não tem compromissos futuros na agenda."
              action={
                <Link
                  href={`/app/appointments/new?clientId=${clientId}&returnTo=${encodeURIComponent(`${returnResumo}?tab=agenda`)}`}
                >
                  <Button>Agendar sessão</Button>
                </Link>
              }
            />
          ) : (
            <ul className="space-y-2">
              {appointments.map((appt) => (
                <li key={appt.id}>
                  <Link
                    href={`/app/appointments/${appt.id}`}
                    className="flex min-h-11 items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-3 transition-colors hover:bg-[var(--color-surface-subtle)]"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-[var(--color-ink)]">
                        {formatOrgDate(appt.starts_at, timeZone)}{" "}
                        ·{" "}
                        {formatOrgDateTime(appt.starts_at, timeZone, {
                          hour: "2-digit",
                          minute: "2-digit",
                          hourCycle: "h23",
                        })}
                      </span>
                      <span className="block truncate text-sm text-[var(--color-ink-muted)]">
                        {appt.service_name || appt.cycle_service_name || "Sessão"}
                        {appt.location_name ? ` · ${appt.location_name}` : ""}
                      </span>
                    </span>
                    <IconCalendarDays className="h-4 w-4 shrink-0 text-[var(--color-ink-subtle)]" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {tab === "plano" ? (
        <section
          id="ficha-panel-plano"
          role="tabpanel"
          aria-labelledby="ficha-tab-plano"
          className="min-h-[16rem] space-y-3"
          aria-label="Plano e ciclo"
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
                  title="Não foi possível carregar plano e ciclo"
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
              <div className="grid gap-3 md:grid-cols-2 md:gap-4">
                <AccompanimentCard
                  icon={<IconRefreshCw className="h-5 w-5" />}
                  title="Ciclo atual"
                  state={activeCycle ? cycleListStatus(activeCycle, todayIso) : "Vazio"}
                  stateTone={activeCycle ? cycleListStatusTone(activeCycle, todayIso) : "neutral"}
                  summary={activeCycle?.service_name || "Sem ciclo"}
                  detail={
                    activeCycle
                      ? [
                          formatCycleVigencyCard(activeCycle.starts_on, activeCycle.ends_on).range,
                          formatCycleVigencyCard(activeCycle.starts_on, activeCycle.ends_on).renewal,
                          activeCycle.lesson_count != null
                            ? `${activeCycle.lessons_completed ?? 0} de ${activeCycle.lesson_count} aulas realizadas`
                            : null,
                          // Agenda associada, no escopo deste ciclo — o detalhe
                          // completo continua na aba Agenda, sem duplicá-la aqui.
                          nextAppointment
                            ? `Próxima sessão ${formatHumanDate(nextAppointment.starts_at.slice(0, 10))}`
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
                          href: `/app/cycles/new?clientId=${clientId}&returnTo=${encodeURIComponent(`${returnResumo}?tab=plano`)}`,
                          label: "Criar ciclo",
                          variant: "primary",
                        }
                  }
                  extras={
                    cycleRenewalHref
                      ? [{ href: cycleRenewalHref, label: "Preparar renovação" }]
                      : []
                  }
                />
                <AccompanimentCard
                  icon={<IconLayers className="h-5 w-5" />}
                  testId="accompaniment-plan-card"
                  title={t(terms, "plan")}
                  state={published || draft ? protocolStatusLabel((published || draft)?.status) : "Vazio"}
                  stateTone={published || draft ? protocolStatusTone((published || draft)?.status) : "neutral"}
                  summary={(published || draft)?.title || "Plano ainda não criado"}
                  detail={
                    (published || draft)?.duration_value
                      ? `${(published || draft)?.duration_value} semanas`
                      : undefined
                  }
                  primary={
                    draft
                      ? {
                          href: `/app/clients/${clientId}/plans/${draft.id}?returnTo=${encodeURIComponent(`${returnResumo}?tab=plano`)}`,
                          label: "Continuar rascunho",
                          variant: "secondary",
                        }
                      : published
                        ? {
                            href: `/app/clients/${clientId}/plans/${published.id}?returnTo=${encodeURIComponent(`${returnResumo}?tab=plano`)}`,
                            label: "Ver plano",
                            variant: "secondary",
                          }
                        : {
                            href: `/app/clients/${clientId}/plans/new?returnTo=${encodeURIComponent(`${returnResumo}?tab=plano`)}`,
                            label: "Criar plano",
                            variant: "primary",
                          }
                  }
                  extras={
                    published
                      ? [
                          {
                            href: `/app/clients/${clientId}/plans/new?returnTo=${encodeURIComponent(`${returnResumo}?tab=plano`)}`,
                            label: "Nova versão",
                          },
                        ]
                      : []
                  }
                />
              </div>

              {pastCycles.length ? (
                <div>
                  <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
                    Histórico de ciclos
                  </h2>
                  <ul className="space-y-1.5">
                    {pastCycles.map((c) => (
                      <li key={c.id}>
                        <Link
                          href={`/app/cycles/${c.id}`}
                          className="flex min-h-11 items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm transition-colors hover:bg-[var(--color-surface-subtle)]"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-[var(--color-ink)]">
                              {c.service_name}
                            </span>
                            <span className="block text-xs text-[var(--color-ink-muted)]">
                              {formatCycleVigencyCard(c.starts_on, c.ends_on).range}
                            </span>
                          </span>
                          <Badge tone={cycleListStatusTone(c, todayIso)}>
                            {cycleListStatus(c, todayIso)}
                          </Badge>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {tab === "prontuario" ? (
        <section
          id="ficha-panel-prontuario"
          role="tabpanel"
          aria-labelledby="ficha-tab-prontuario"
          className="min-h-[16rem] space-y-4"
          aria-label="Prontuário"
        >
          <div>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
              Anamnese
            </h2>
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
                    {anamnesisDone ? "Revisada" : "Respostas enviadas, aguardando revisão"}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-medium text-[var(--color-link)]">Ver</span>
              </Link>
            ) : (
              <p className="text-sm text-[var(--color-ink-muted)]">
                Nenhuma {terms.intake_form} enviada ainda.
              </p>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
                Avaliações
              </h2>
              <Link
                href={`/app/clients/${clientId}/evaluations/new?returnTo=${encodeURIComponent(`${returnResumo}?tab=prontuario`)}`}
                className="text-sm font-medium text-[var(--color-primary)]"
              >
                Registrar avaliação
              </Link>
            </div>

            {!evaluations.length ? (
              <p className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] px-3 py-3 text-sm text-[var(--color-ink-muted)]">
                Nenhuma avaliação registrada. Registre o ponto de partida quando fizer sentido.
              </p>
            ) : (
              <div className="space-y-3">
                {draftEvaluations.length ? (
                  <div>
                    <p className="mb-1.5 text-xs font-semibold text-[var(--color-ink-muted)]">
                      Rascunhos — visíveis só para você
                    </p>
                    <ul className="space-y-1.5">
                      {draftEvaluations.map((ev) => (
                        <li key={ev.id}>
                          <Link
                            href={`/app/clients/${clientId}/evaluations/${ev.id}?returnTo=${encodeURIComponent(`${returnResumo}?tab=prontuario`)}`}
                            className="flex min-h-11 items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm transition-colors hover:bg-[var(--color-surface-subtle)]"
                          >
                            <span className="truncate text-[var(--color-ink)]">{ev.title}</span>
                            <Badge tone="neutral">Rascunho</Badge>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {publishedEvaluations.length ? (
                  <div>
                    <p className="mb-1.5 text-xs font-semibold text-[var(--color-ink-muted)]">
                      Publicadas — visíveis no portal do cliente
                    </p>
                    <ul className="space-y-1.5">
                      {publishedEvaluations.map((ev) => (
                        <li key={ev.id}>
                          <Link
                            href={`/app/clients/${clientId}/evaluations/${ev.id}?returnTo=${encodeURIComponent(`${returnResumo}?tab=prontuario`)}`}
                            className="flex min-h-11 items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm transition-colors hover:bg-[var(--color-surface-subtle)]"
                          >
                            <span className="truncate text-[var(--color-ink)]">{ev.title}</span>
                            <span className="shrink-0 text-[var(--color-ink-muted)]">
                              {formatDateBR((ev.published_at || ev.created_at).slice(0, 10))}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
              Acompanhamento
            </h2>
            <p className="text-sm text-[var(--color-ink-muted)]">
              Etapa atual: {stageLabel}
              {actionLabel ? ` · ${actionLabel}` : ""}
            </p>
            <Link
              href={prepareHref}
              className="mt-1 inline-block text-sm font-medium text-[var(--color-primary)]"
            >
              Ver preparação completa
            </Link>
          </div>
        </section>
      ) : null}

      {tab === "financeiro" ? (
        <section
          id="ficha-panel-financeiro"
          role="tabpanel"
          aria-labelledby="ficha-tab-financeiro"
          className="min-h-[8rem] space-y-3"
          aria-label="Financeiro"
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
                Em aberto
              </p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--color-ink)]">
                {formatBRL(pendingTotalCents)}
              </p>
            </div>
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
                Atrasadas
              </p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--color-danger)]">
                {overdueReceivables.length}
              </p>
            </div>
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
                Recebido (histórico)
              </p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--color-success)]">
                {formatBRL(receivedTotalCents)}
              </p>
            </div>
          </div>

          {receivables.length === 0 ? (
            <EmptyStateGuide
              title="Nenhuma cobrança registrada"
              body="As cobranças deste cliente aparecerão aqui conforme os ciclos forem criados."
            />
          ) : (
            <>
              {overdueReceivables.length ? (
                <ReceivableGroup title="Vencidas" items={overdueReceivables} today={todayIso} />
              ) : null}
              {futurePendingReceivables.length ? (
                <ReceivableGroup
                  title="Próximos recebimentos"
                  items={futurePendingReceivables}
                  today={todayIso}
                />
              ) : null}
              {receivedReceivables.length ? (
                <ReceivableGroup title="Recebidas" items={receivedReceivables} today={todayIso} />
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {tab === "historico" ? (
        <section
          id="ficha-panel-historico"
          role="tabpanel"
          aria-labelledby="ficha-tab-historico"
          className="min-h-[8rem] space-y-3"
          aria-label="Histórico"
        >
          {(() => {
            type HistoryEntry = { date: string; label: string; detail: string; href?: string };
            const entries: HistoryEntry[] = [
              ...evaluations.map((ev) => ({
                date: (ev.published_at || ev.created_at).slice(0, 10),
                label: "Avaliação",
                detail: ev.title,
                href: `/app/clients/${clientId}/evaluations/${ev.id}?returnTo=${encodeURIComponent(`${returnResumo}?tab=historico`)}`,
              })),
              ...receivables
                .filter((r) => r.status === "paid" || r.status === "received")
                .map((r) => ({
                  date: r.paid_at ? r.paid_at.slice(0, 10) : r.due_on,
                  label: "Pagamento recebido",
                  detail: formatBRL(r.amount_cents),
                })),
              // Sessões realizadas ficam de fora aqui de propósito: o fetch
              // de appointments deste componente (GET /clients/{id}/appointments)
              // só traz sessões futuras (para a aba Agenda), então nunca
              // haveria uma sessão "completed" real para listar — melhor
              // omitir do que fingir uma categoria vazia.
            ].sort((a, b) => b.date.localeCompare(a.date));

            if (!entries.length) {
              return (
                <EmptyStateGuide
                  title="Sem histórico ainda"
                  body="Avaliações e pagamentos recebidos aparecerão aqui em ordem cronológica."
                />
              );
            }

            return (
              <ol className="space-y-2">
                {entries.map((entry, index) => {
                  const content = (
                    <>
                      <span className="w-16 shrink-0 text-xs font-medium tabular-nums text-[var(--color-ink-muted)]">
                        {formatHumanDate(entry.date)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-[var(--color-ink)]">{entry.label}</span>
                        <span className="block truncate text-sm text-[var(--color-ink-muted)]">{entry.detail}</span>
                      </span>
                    </>
                  );
                  return (
                    <li
                      key={`${entry.label}-${entry.date}-${index}`}
                      className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2.5"
                    >
                      {entry.href ? (
                        <Link href={entry.href} className="flex min-w-0 flex-1 items-center gap-3">
                          {content}
                        </Link>
                      ) : (
                        content
                      )}
                    </li>
                  );
                })}
              </ol>
            );
          })()}
        </section>
      ) : null}
      </div>

      {/* Mobile: not a compressed copy of the 6 desktop tabs. A single
          consolidated summary — the professional's pocket view — with
          deeper detail behind explicit disclosure, never all at once. */}
      {item ? (
        <div className="space-y-3 lg:hidden" aria-label="Resumo do cliente">
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

          {alerts.length > 0 ? (
            <div className="space-y-1.5 rounded-[var(--radius-md)] border border-[var(--color-warning)]/25 bg-[var(--color-warning-subtle)] p-3">
              {alerts.map((text) => (
                <p key={text} className="text-sm text-[var(--color-warning)]">
                  {text}
                </p>
              ))}
              {routinePendingCount && routinePendingCount > 0 ? (
                <Link
                  href={`/app/routines/pending?clientId=${clientId}&returnTo=${encodeURIComponent(returnResumo)}`}
                  className="inline-block text-sm font-medium text-[var(--color-link)]"
                >
                  Ver rotinas pendentes
                </Link>
              ) : null}
            </div>
          ) : null}

          {!submissionId ? (
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <p className="text-sm font-semibold text-[var(--color-ink)]">
                Envie o formulário para {firstName(item.full_name)} completar o cadastro.
              </p>
              <div className="mt-3">
                <ClientIntakeInviteButton clientId={clientId} />
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
                Próxima sessão
              </p>
              <p className="mt-1 text-sm text-[var(--color-ink)]">
                {nextAppointment
                  ? `${formatOrgDate(nextAppointment.starts_at, timeZone)} · ${formatOrgDateTime(nextAppointment.starts_at, timeZone, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}`
                  : "Sem agendamento"}
              </p>
            </div>
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
                Plano e ciclo
              </p>
              <p className="mt-1 truncate text-sm text-[var(--color-ink)]">
                {activeCycle?.service_name || "Sem ciclo ativo"}
              </p>
              <p className="text-sm text-[var(--color-ink-muted)]">
                {activeCycle
                  ? activeCycle.lesson_count != null
                    ? `${activeCycle.lessons_completed ?? 0} de ${activeCycle.lesson_count} sessões`
                    : cycleListStatus(activeCycle, todayIso)
                  : "—"}
              </p>
            </div>
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
                Última evolução
              </p>
              <p className="mt-1 truncate text-sm text-[var(--color-ink)]">
                {latestEvaluation
                  ? `${protocolStatusLabel(latestEvaluation.status)} · ${formatDateBR((latestEvaluation.published_at || latestEvaluation.created_at).slice(0, 10))}`
                  : "Nenhuma registrada"}
              </p>
            </div>
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
                Financeiro
              </p>
              <p className="mt-1 text-sm text-[var(--color-ink)]">
                {pendingReceivables.length > 0 ? formatBRL(pendingTotalCents) : "Em dia"}
              </p>
              {overdueReceivables.length > 0 ? (
                <Badge tone="danger">
                  {overdueReceivables.length}{" "}
                  {overdueReceivables.length === 1 ? "atrasada" : "atrasadas"}
                </Badge>
              ) : null}
            </div>
          </div>

          <details className="group rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 py-2.5 text-sm font-semibold text-[var(--color-ink)] [&::-webkit-details-marker]:hidden">
              Agenda completa
              <IconChevronDown className="h-4 w-4 shrink-0 text-[var(--color-ink-subtle)] transition-transform group-open:rotate-180" />
            </summary>
            <div className="space-y-2 border-t border-[var(--color-border)] p-3">
              <Link
                href={`/app/appointments/new?clientId=${clientId}&returnTo=${encodeURIComponent(returnResumo)}`}
              >
                <Button variant="secondary" className="min-h-10 px-3 text-sm">
                  <IconCalendarPlus className="mr-1.5 h-4 w-4" aria-hidden />
                  Agendar
                </Button>
              </Link>
              {appointments.length === 0 ? (
                <p className="text-sm text-[var(--color-ink-muted)]">
                  Nenhuma sessão futura agendada.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {appointments.map((appt) => (
                    <li key={appt.id}>
                      <Link
                        href={`/app/appointments/${appt.id}`}
                        className="flex min-h-11 items-center justify-between gap-3 rounded-[var(--radius-sm)] px-2 py-2 text-sm transition-colors hover:bg-[var(--color-surface-subtle)]"
                      >
                        <span className="min-w-0">
                          <span className="font-medium text-[var(--color-ink)]">
                            {formatOrgDate(appt.starts_at, timeZone)} ·{" "}
                            {formatOrgDateTime(appt.starts_at, timeZone, {
                              hour: "2-digit",
                              minute: "2-digit",
                              hourCycle: "h23",
                            })}
                          </span>
                          <span className="block truncate text-[var(--color-ink-muted)]">
                            {appt.service_name || appt.cycle_service_name || "Sessão"}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </details>

          <details className="group rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 py-2.5 text-sm font-semibold text-[var(--color-ink)] [&::-webkit-details-marker]:hidden">
              Prontuário
              <IconChevronDown className="h-4 w-4 shrink-0 text-[var(--color-ink-subtle)] transition-transform group-open:rotate-180" />
            </summary>
            <div className="space-y-2 border-t border-[var(--color-border)] p-3 text-sm">
              <p>
                <span className="font-medium text-[var(--color-ink)]">Anamnese: </span>
                <span className="text-[var(--color-ink-muted)]">
                  {anamnesisDone ? "Revisada" : submissionId ? "Aguardando revisão" : "Não enviada"}
                </span>
                {submissionId ? (
                  <>
                    {" · "}
                    <Link href={`/app/clients/intake/${submissionId}`} className="text-[var(--color-link)]">
                      Ver
                    </Link>
                  </>
                ) : null}
              </p>
              {evaluations.length === 0 ? (
                <p className="text-[var(--color-ink-muted)]">Nenhuma avaliação registrada.</p>
              ) : (
                <ul className="space-y-1">
                  {evaluations.map((ev) => (
                    <li key={ev.id}>
                      <Link
                        href={`/app/clients/${clientId}/evaluations/${ev.id}?returnTo=${encodeURIComponent(returnResumo)}`}
                        className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 hover:bg-[var(--color-surface-subtle)]"
                      >
                        <span className="truncate text-[var(--color-ink)]">{ev.title}</span>
                        <span className="shrink-0 text-[var(--color-ink-muted)]">
                          {formatDateBR((ev.published_at || ev.created_at).slice(0, 10))}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <Link
                href={`/app/clients/${clientId}/evaluations/new?returnTo=${encodeURIComponent(returnResumo)}`}
                className="inline-block"
              >
                <Button variant="secondary" className="min-h-10 px-3 text-sm">
                  Nova avaliação
                </Button>
              </Link>
            </div>
          </details>

          <details className="group rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 py-2.5 text-sm font-semibold text-[var(--color-ink)] [&::-webkit-details-marker]:hidden">
              Financeiro completo
              <IconChevronDown className="h-4 w-4 shrink-0 text-[var(--color-ink-subtle)] transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-t border-[var(--color-border)] p-3">
              {receivables.length === 0 ? (
                <p className="text-sm text-[var(--color-ink-muted)]">Nenhuma cobrança registrada.</p>
              ) : (
                <ul className="space-y-2">
                  {receivables.map((r) => {
                    const overdue = isReceivableOverdue(r, todayIso);
                    return (
                      <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                        <span>
                          <span className="font-medium text-[var(--color-ink)]">
                            {formatBRL(r.amount_cents)}
                          </span>
                          <span className="block text-[var(--color-ink-muted)]">
                            Vencimento {formatDateBR(r.due_on)}
                          </span>
                        </span>
                        <Badge tone={receivableStatusTone(r.status, overdue)}>
                          {receivableStatusLabel(r.status, overdue)}
                        </Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </details>

          <details className="group rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 py-2.5 text-sm font-semibold text-[var(--color-ink)] [&::-webkit-details-marker]:hidden">
              Histórico
              <IconChevronDown className="h-4 w-4 shrink-0 text-[var(--color-ink-subtle)] transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-t border-[var(--color-border)] p-3">
              {(() => {
                type HistoryEntry = { date: string; label: string; detail: string };
                const entries: HistoryEntry[] = [
                  ...evaluations.map((ev) => ({
                    date: (ev.published_at || ev.created_at).slice(0, 10),
                    label: "Avaliação",
                    detail: ev.title,
                  })),
                  ...receivables
                    .filter((r) => r.status === "paid" || r.status === "received")
                    .map((r) => ({
                      date: r.paid_at ? r.paid_at.slice(0, 10) : r.due_on,
                      label: "Pagamento recebido",
                      detail: formatBRL(r.amount_cents),
                    })),
                ].sort((a, b) => b.date.localeCompare(a.date));
                if (!entries.length) {
                  return <p className="text-sm text-[var(--color-ink-muted)]">Sem histórico ainda.</p>;
                }
                return (
                  <ul className="space-y-2 text-sm">
                    {entries.map((entry, index) => (
                      <li key={`${entry.label}-${entry.date}-${index}`} className="flex gap-2">
                        <span className="w-14 shrink-0 tabular-nums text-[var(--color-ink-muted)]">
                          {formatHumanDate(entry.date)}
                        </span>
                        <span className="min-w-0">
                          <span className="block font-medium text-[var(--color-ink)]">{entry.label}</span>
                          <span className="block truncate text-[var(--color-ink-muted)]">{entry.detail}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                );
              })()}
            </div>
          </details>

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
        </div>
      ) : null}

      <ActionSheet
        open={noteSheetOpen}
        onClose={() => setNoteSheetOpen(false)}
        labelledBy="add-note-title"
      >
        <h2 id="add-note-title" className="text-base font-semibold text-[var(--color-ink)]">
          Anotação interna
        </h2>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Visível só para você — nunca aparece no portal do cliente.
        </p>
        <div className="mt-3">
          <TextArea
            label="Anotação"
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            rows={5}
          />
        </div>
        {noteError ? (
          <p role="alert" className="mt-2 text-sm text-[var(--color-danger)]">
            {noteError}
          </p>
        ) : null}
        {noteSaved ? (
          <p role="status" className="mt-2 text-sm font-medium text-[var(--color-success)]">
            Anotação salva
          </p>
        ) : null}
        <Button
          fullWidth
          className="mt-3"
          disabled={noteSaving}
          onClick={() => void saveNote()}
        >
          {noteSaving ? "Salvando…" : "Salvar anotação"}
        </Button>
      </ActionSheet>

      <span className="hidden">{safeReturnTo(returnResumo)}</span>
    </div>
  );
}
