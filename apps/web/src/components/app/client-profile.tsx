"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
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
  type RenewalCaseView,
} from "@/lib/api";
import {
  buildRenewalCaseIndex,
  cycleRenewalCase,
  renewalStatusLabel,
  renewalStatusTone,
} from "@/lib/renewal-status";
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
import { ClientEditDrawer } from "@/components/app/client-edit-drawer";
import { useMediaQuery } from "@/lib/use-media-query";
import { ActionSheet } from "@/components/ui/action-sheet";
import {
  getClientProfileSnapshot,
  invalidateClientProfileSnapshot,
  setClientProfileSnapshot,
} from "@/lib/client-profile-cache";
import { TextArea } from "@/components/ui/text-area";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockError } from "@/components/ui/block-error";
import { MenuItem } from "@/components/ui/menu-item";
import { AskAssistantLink } from "@/components/ui/ask-assistant-link";
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

type NextStep = {
  title: string;
  isPending: boolean;
  text: string;
  cta: string | null;
  href: string | null;
};

function RelationshipFact({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "danger" | "warning";
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-subtle)]">
        {label}
      </p>
      <p
        className={`mt-0.5 truncate text-sm font-semibold ${
          tone === "danger"
            ? "text-[var(--color-danger)]"
            : tone === "warning"
              ? "text-[var(--color-warning)]"
              : "text-[var(--color-ink)]"
        }`}
      >
        {value}
      </p>
      {sub ? <p className="truncate text-xs text-[var(--color-ink-muted)]">{sub}</p> : null}
    </div>
  );
}

/**
 * The one dominant visual moment on Cliente 360° — the current state of the
 * relationship (ciclo, avaliação, renovação, financeiro) plus the single
 * next action, in one surface instead of five equal-weight cards competing
 * for attention. Everything else on the Resumo tab (contato, anamnese,
 * portal, rotinas) stays in the plain flat grid it was already in — mixing
 * more than one "hero" surface per screen defeats the point. Brand
 * (indigo), never AI-violet: this is real client data, not something
 * Cronia analyzed (see `.surface-briefing`'s own comment in globals.css).
 */
function RelationshipStateCard({
  next,
  activeCycle,
  nextAppointment,
  latestEvaluation,
  pendingReceivables,
  overdueReceivables,
  pendingTotalCents,
  timeZone,
  todayIso,
}: {
  next: NextStep;
  activeCycle: Cycle | null;
  nextAppointment: Appointment | null;
  latestEvaluation: ClientEvaluation | null;
  pendingReceivables: Receivable[];
  overdueReceivables: Receivable[];
  pendingTotalCents: number;
  timeZone: string;
  todayIso: string;
}) {
  const cycleValue = activeCycle?.service_name || "Sem ciclo ativo";
  const cycleProgress = activeCycle
    ? activeCycle.lesson_count != null
      ? `${activeCycle.lessons_completed ?? 0} de ${activeCycle.lesson_count} sessões`
      : cycleListStatus(activeCycle, todayIso)
    : undefined;
  const evaluationValue = latestEvaluation
    ? `${protocolStatusLabel(latestEvaluation.status)} · ${formatDateBR((latestEvaluation.published_at || latestEvaluation.created_at).slice(0, 10))}`
    : "Nenhuma registrada";
  const renewalValue =
    activeCycle?.is_nearing_end && activeCycle.days_remaining != null
      ? `Em ${activeCycle.days_remaining} ${activeCycle.days_remaining === 1 ? "dia" : "dias"}`
      : "—";
  const financeValue = pendingReceivables.length > 0 ? formatBRL(pendingTotalCents) : "Em dia";
  const nextSessionValue = nextAppointment
    ? `${formatOrgDate(nextAppointment.starts_at, timeZone)} · ${formatOrgDateTime(nextAppointment.starts_at, timeZone, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}`
    : "Sem agendamento";

  return (
    <div className="surface-briefing hover-lift rounded-[var(--radius-lg)] p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-primary)]">
            {next.title}
          </p>
          <p className="text-base font-medium text-[var(--color-ink)]">{next.text}</p>
        </div>
        {next.cta && next.href ? (
          <Link href={next.href} className="shrink-0">
            <Button className="min-h-9 px-3 text-sm">{next.cta}</Button>
          </Link>
        ) : null}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-[var(--color-primary)]/12 pt-3.5 sm:grid-cols-5">
        <RelationshipFact label="Ciclo" value={cycleValue} sub={cycleProgress} />
        <RelationshipFact label="Próxima sessão" value={nextSessionValue} />
        <RelationshipFact label="Avaliação" value={evaluationValue} />
        <RelationshipFact label="Renovação" value={renewalValue} tone={renewalValue !== "—" ? "warning" : undefined} />
        <RelationshipFact
          label="Financeiro"
          value={financeValue}
          tone={overdueReceivables.length > 0 ? "danger" : undefined}
        />
      </div>
    </div>
  );
}

export { __resetClientProfileCacheForTests } from "@/lib/client-profile-cache";

export function ClientProfile({ clientId }: Props) {
  const router = useRouter();
  const search = useSearchParams();
  const { me } = useAuth();
  const timeZone = me?.organization.timezone || "America/Sao_Paulo";
  const rawTab = search.get("tab");
  const tab: Tab = TABS.some((entry) => entry.id === rawTab) ? (rawTab as Tab) : "resumo";
  // The cache is scoped by authenticated identity (org + user), never by
  // clientId alone — see client-profile-cache.ts for why a bare
  // clientId-keyed Map is a security gap, not just a staleness one.
  // `me` is guaranteed non-null here: AppShell never renders this page
  // while `!me` (see app-shell.tsx), so there is no "not yet known
  // identity" render of this component to guard against — but the
  // `null` fallback is kept anyway so a future change to that gate fails
  // safe (no scope → no cache read/write, not a guessed one).
  const scopeKey = me ? `${me.organization.id}:${me.user.id}` : null;
  // The route renders this component with `key={clientId}` (see
  // app/clients/[clientId]/page.tsx), so it fully remounts — fresh state,
  // fresh skeleton — every time, including a plain back-navigation from
  // Rotinas to the SAME student a moment later. Seeding state from the
  // last good snapshot for THIS id+identity lets the real content render
  // immediately on that remount instead of flashing the full skeleton
  // again; `load()` still runs to refresh it silently. A genuinely new
  // client id (or a first render after login/org switch) has nothing
  // cached and still gets the real first-load skeleton.
  const cached = scopeKey ? getClientProfileSnapshot(scopeKey, clientId) : undefined;
  const [item, setItem] = useState<Client | null>(cached?.item ?? null);
  const [editOpen, setEditOpen] = useState(false);
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [justCreatedCycle, setJustCreatedCycle] = useState(false);
  const [access, setAccess] = useState<ClientAccess | null>(cached?.access ?? null);
  const [journey, setJourney] = useState<ClientJourney | null>(cached?.journey ?? null);
  const [protocols, setProtocols] = useState<Protocol[]>(cached?.protocols ?? []);
  const [cycles, setCycles] = useState<Cycle[]>(cached?.cycles ?? []);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [noteSheetOpen, setNoteSheetOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [noteSaved, setNoteSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!cached);
  const [evaluations, setEvaluations] = useState<ClientEvaluation[]>(cached?.evaluations ?? []);
  const [appointments, setAppointments] = useState<Appointment[]>(cached?.appointments ?? []);
  const [receivables, setReceivables] = useState<Receivable[]>(cached?.receivables ?? []);
  const [todayIso, setTodayIso] = useState(cached?.todayIso ?? "2026-01-01");
  const [routinePendingCount, setRoutinePendingCount] = useState<number | null>(
    cached?.routinePendingCount ?? null,
  );
  const [routineOverdueCount, setRoutineOverdueCount] = useState(
    cached?.routineOverdueCount ?? 0,
  );
  const [submissionId, setSubmissionId] = useState<string | null>(cached?.submissionId ?? null);
  const [renewalCases, setRenewalCases] = useState<RenewalCaseView[]>(cached?.renewalCases ?? []);
  // Guards against an older, slower `load()` call resolving AFTER a
  // newer one (e.g. the retry button in the error state fires a second
  // request before the first settles) — only the response matching the
  // most recently started request is allowed to touch state or the
  // cache; an out-of-order one is silently discarded.
  const requestSeq = useRef(0);

  const terms = nomenclatureFor(me?.organization.profession_code);
  const returnResumo = `/app/clients/${clientId}`;

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    const [c, a, j, p, cy, pref, ev, rb, sub, appts, recv, ren] = await Promise.all([
      apiFetch<Client>(`/api/v1/clients/${clientId}`),
      apiFetch<ClientAccess>(`/api/v1/clients/${clientId}/public-access`),
      apiFetch<ClientJourney>(`/api/v1/clients/${clientId}/journey`),
      apiFetch<Protocol[]>(`/api/v1/protocols?client_id=${clientId}`),
      apiFetch<Cycle[]>(`/api/v1/cycles?client_id=${clientId}`),
      apiFetch<{ local_today: string }>("/api/v1/organization/preferences"),
      apiFetch<ClientEvaluation[]>(`/api/v1/clients/${clientId}/evaluations`),
      apiFetch<{
        groups: Array<{ occurrence_count?: number; count: number; overdue_count?: number }>;
      }>(`/api/v1/routines/board?client_id=${clientId}`),
      apiFetch<Array<{ id: string; submitted_at: string | null }>>(
        `/api/v1/intake-submissions?client_id=${clientId}`,
      ),
      apiFetch<Appointment[]>(`/api/v1/clients/${clientId}/appointments?limit=10`),
      apiFetch<Receivable[]>(`/api/v1/clients/${clientId}/receivables`),
      apiFetch<RenewalCaseView[]>("/api/v1/renewal-cases?scope=all"),
    ]);
    // An older request that resolves after a newer one started must
    // never win — neither for the live state below nor for the cache.
    if (seq !== requestSeq.current) return;

    const isAuthOrNotFound = c.status === 401 || c.status === 403 || c.status === 404;
    if (c.error) {
      setError(c.error.message);
      if (isAuthOrNotFound) {
        // A confirmed auth failure or a client that no longer exists
        // means whatever was showing (live or hydrated from cache) is no
        // longer trustworthy — never leave stale content up under a
        // definitive negative answer from the server.
        setItem(null);
        if (scopeKey) invalidateClientProfileSnapshot(scopeKey, clientId);
      }
    } else {
      setItem(c.data ?? null);
    }
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
      setRoutineOverdueCount(rb.data.groups.reduce((sum, g) => sum + (g.overdue_count ?? 0), 0));
    }
    if (sub.data?.length) setSubmissionId(sub.data[0].id);
    if (appts.data) setAppointments(appts.data);
    if (recv.data) setReceivables(recv.data);
    if (ren.data) setRenewalCases(ren.data.filter((r) => r.client_id === clientId));
    setLoading(false);

    // Mirror the same "keep the last good value when this round's fetch
    // for that field failed" rule used above for the live state — a
    // background refetch that partially fails must not make a future
    // remount regress a field that was fine a moment ago.
    if (c.data && scopeKey) {
      const prevCache = getClientProfileSnapshot(scopeKey, clientId);
      setClientProfileSnapshot(scopeKey, clientId, {
        item: c.data,
        access: a.data ?? prevCache?.access ?? null,
        journey: j.data ?? prevCache?.journey ?? null,
        protocols: p.data ?? prevCache?.protocols ?? [],
        cycles: cy.data ?? prevCache?.cycles ?? [],
        todayIso: pref.data?.local_today ?? prevCache?.todayIso ?? "2026-01-01",
        evaluations: ev.data ?? prevCache?.evaluations ?? [],
        routinePendingCount: rb.data
          ? rb.data.groups.reduce((sum, g) => sum + (g.occurrence_count ?? g.count), 0)
          : (prevCache?.routinePendingCount ?? null),
        routineOverdueCount: rb.data
          ? rb.data.groups.reduce((sum, g) => sum + (g.overdue_count ?? 0), 0)
          : (prevCache?.routineOverdueCount ?? 0),
        submissionId: sub.data?.length ? sub.data[0].id : (prevCache?.submissionId ?? null),
        appointments: appts.data ?? prevCache?.appointments ?? [],
        receivables: recv.data ?? prevCache?.receivables ?? [],
        renewalCases: ren.data
          ? ren.data.filter((r) => r.client_id === clientId)
          : (prevCache?.renewalCases ?? []),
      });
    }
  }, [clientId, scopeKey]);

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

  // Renewal offer reuses the very same derivation as the Ciclos central, fed
  // by the same RenewalCase index, so a cycle never looks renewable here and
  // non-renewable there. It only ever produces a link into the existing flow
  // — clicking mutates nothing.
  const renewalCaseIndex = buildRenewalCaseIndex(renewalCases);
  const activeCycleRow = activeCycle
    ? buildCycleRow(activeCycle, {
        receivables,
        nextAppointmentByClientId: nextAppointment
          ? { [clientId]: nextAppointment }
          : {},
        renewalCases: renewalCaseIndex,
        today: todayIso,
      })
    : null;
  const activeCycleRenewalCase = activeCycle
    ? cycleRenewalCase(activeCycle.id, renewalCaseIndex)
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
    // Archived clients get no onboarding/creation nudges — the only
    // meaningful "next step" for an archived client is reactivating them,
    // which already has its own dedicated primary action.
    if (item?.status === "archived") {
      return {
        title: "Cliente arquivado",
        isPending: false,
        text: `${name} está arquivado. Reative para retomar o acompanhamento.`,
        cta: null as string | null,
        href: null as string | null,
      };
    }
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
    if (action === "configure_routine") {
      // This checklist step tracks a deliberate recurring-cadence setup
      // for this client — a different, narrower thing than "this client
      // already has routine tasks on the board" (routinePendingCount):
      // an org-wide routine can generate tasks for many clients at once
      // without anyone having reviewed THIS one specifically, so the two
      // numbers can legitimately disagree. Naming both here (instead of
      // only the checklist's generic CTA) avoids reading as a
      // contradiction when a student already has pending routines.
      return {
        title: "Próximo passo",
        isPending: true,
        text: routinePendingCount
          ? `${name} já tem ${routinePendingCount} ${
              routinePendingCount === 1 ? "rotina" : "rotinas"
            } na agenda — isso é diferente de revisar a configuração recorrente deste checklist.`
          : `Configure a rotina de acompanhamento de ${name}.`,
        cta: journey?.next_action_label || "Configurar rotina",
        href: prepareHref,
      };
    }
    if (
      action === "review_anamnesis" ||
      action === "register_evaluation" ||
      action === "create_plan" ||
      action === "activate_accompaniment" ||
      action === "prepare_accompaniment" ||
      action === "continue_onboarding"
    ) {
      // The backend (resolve_accompaniment) is the single source of truth
      // for what's actually next — it knows things this page can't derive
      // from the checklist alone, like evaluation never being presentable
      // before a cycle exists. The CTA below already names that one
      // canonical step (next_action_label) — never a locally re-enumerated
      // "Falta: ..." list across all steps.
      return {
        title: "Próximo passo",
        isPending: true,
        text: `Continue a preparação de ${name}.`,
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
  // The "ROTINAS" card below already shows the permanent pending count —
  // this yellow alert strip is for what's actually urgent (the backend's
  // own `overdue_count`, due_on < hoje e ainda aberta), not a second copy
  // of the same pending total. A cycle-ending-soon or today's routine
  // isn't overdue and must not trigger this banner.
  if (routineOverdueCount > 0) {
    alerts.push(
      `${routineOverdueCount} ${routineOverdueCount === 1 ? "rotina atrasada" : "rotinas atrasadas"}.`,
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
              <MenuItem
                href={access.public_path ?? access.public_url}
                external
                icon={<IconExternalLink className="h-4 w-4" aria-hidden />}
                onClick={() => setMenuOpen(false)}
              >
                Visualizar como cliente
              </MenuItem>
            ) : null}
            {access?.has_active_link && access.public_url ? (
              <MenuItem onClick={() => void copyMenuAccess()}>Copiar acesso do portal</MenuItem>
            ) : (
              <MenuItem
                onClick={() => {
                  setTab("resumo");
                  setMenuOpen(false);
                }}
              >
                Criar acesso do portal
              </MenuItem>
            )}
            {item && item.status !== "archived" ? (
              <>
                <div className="my-1 border-t border-[var(--color-border)]" />
                <MenuItem
                  href={`/app/clients/${clientId}/evaluations/new?returnTo=${encodeURIComponent(returnResumo)}`}
                  icon={<IconClipboardList className="h-4 w-4" aria-hidden />}
                  onClick={() => setMenuOpen(false)}
                >
                  Registrar avaliação
                </MenuItem>
                <MenuItem
                  href={`/app/routines?clientId=${clientId}`}
                  icon={<IconRefreshCw className="h-4 w-4" aria-hidden />}
                  onClick={() => setMenuOpen(false)}
                >
                  Criar rotina
                </MenuItem>
              </>
            ) : null}
            {item ? (
              <MenuItem
                icon={<IconPlus className="h-4 w-4" aria-hidden />}
                onClick={() => {
                  setMenuOpen(false);
                  openNoteSheet();
                }}
              >
                Adicionar anotação
              </MenuItem>
            ) : null}
            {item && isDesktop ? (
              <MenuItem
                onClick={() => {
                  setMenuOpen(false);
                  setEditOpen(true);
                }}
              >
                Editar
              </MenuItem>
            ) : item ? (
              <MenuItem href={`/app/clients/${clientId}/edit`} onClick={() => setMenuOpen(false)}>
                Editar
              </MenuItem>
            ) : null}
            <div className="my-1 border-t border-[var(--color-border)]" />
            {item?.status === "archived" ? (
              <MenuItem disabled={busy} onClick={() => void reactivate()}>
                Reativar
              </MenuItem>
            ) : (
              <MenuItem danger disabled={busy} onClick={() => void archive()}>
                Arquivar
              </MenuItem>
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
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-40" />
        </div>
      )}

      {error ? <BlockError message={error} /> : null}

      {justCreatedCycle ? (
        <p
          role="status"
          className="rounded-[var(--radius-md)] border border-[var(--color-success)]/25 bg-[var(--color-success-subtle)] px-3 py-2 text-sm font-medium text-[var(--color-success)]"
        >
          Ciclo criado com sucesso.
        </p>
      ) : null}

      {/* One contextual primary action + Cronia — never competing for
          attention. Registrar avaliação, Criar rotina, Adicionar anotação
          and Editar moved into "Mais ações" above: they're real actions,
          just not the one thing most people come to this ficha to do. */}
      {item && item.status === "archived" ? (
        <div className="flex flex-wrap items-center gap-2" aria-label="Ações do cliente">
          <Button type="button" disabled={busy} onClick={() => void reactivate()} className="min-h-10">
            <IconRefreshCw className="mr-1.5 h-4 w-4" aria-hidden />
            Reativar cliente
          </Button>
          <AskAssistantLink
            prompt={`Sobre ${item.full_name}: `}
            context={`Cliente: ${item.full_name}`}
            returnTo={returnResumo}
          >
            Perguntar sobre este cliente
          </AskAssistantLink>
        </div>
      ) : item ? (
        <div className="flex flex-wrap items-center gap-2" aria-label="Ações do cliente">
          <Link href={`/app/appointments/new?clientId=${clientId}&returnTo=${encodeURIComponent(returnResumo)}`}>
            <Button type="button" className="min-h-10">
              <IconCalendarPlus className="mr-1.5 h-4 w-4" aria-hidden />
              Agendar
            </Button>
          </Link>
          <AskAssistantLink
            prompt={`Sobre ${item.full_name}: `}
            context={`Cliente: ${item.full_name}`}
            returnTo={returnResumo}
          >
            Perguntar sobre este cliente
          </AskAssistantLink>
        </div>
      ) : (
        // Same row shape as the loaded actions — the near-empty first
        // second the redesign called out came from this whole row (and
        // the tabs' content) vanishing until `item` arrived, not just the
        // header. A matching skeleton keeps the page's shape stable
        // instead of it visibly assembling itself.
        <div className="flex items-center gap-2" aria-hidden>
          <Skeleton className="h-10 w-28 rounded-[var(--radius-md)]" />
          <Skeleton className="h-10 w-44 rounded-full" />
        </div>
      )}

      {/* Desktop: full tabbed CRM view — never compressed onto mobile.
          Mobile gets its own consolidated, progressively-disclosed layout
          below instead of these same 6 tabs squeezed into a small screen. */}
      <div className="hidden lg:block">
      <div
        role="tablist"
        aria-label="Ficha"
        onKeyDown={onTabKey}
        className="flex h-[3.25rem] w-full items-stretch gap-0.5 rounded-[var(--radius-md)] border border-[var(--color-border)]/60 bg-[var(--color-surface-subtle)] p-0.5 shadow-[inset_0_1px_2px_rgba(15,15,20,0.04)] lg:grid lg:grid-cols-6"
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
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : item ? (
            <>
              <RelationshipStateCard
                next={next}
                activeCycle={activeCycle}
                nextAppointment={nextAppointment}
                latestEvaluation={latestEvaluation}
                pendingReceivables={pendingReceivables}
                overdueReceivables={overdueReceivables}
                pendingTotalCents={pendingTotalCents}
                timeZone={timeZone}
                todayIso={todayIso}
              />

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
                <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-sm">
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
                <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-sm">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
                    Contato
                  </dt>
                  <dd className="mt-1 text-sm text-[var(--color-ink)]">{formatPhoneBR(item.phone)}</dd>
                  <dd className="text-sm text-[var(--color-ink-muted)]">{item.email || "—"}</dd>
                </div>
                <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-sm">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
                    Anamnese
                  </dt>
                  <dd className="mt-1 text-sm text-[var(--color-ink)]">
                    {anamnesisDone ? "Revisada" : submissionId ? "Aguardando revisão" : "Não enviada"}
                  </dd>
                  {submissionId ? (
                    <Link
                      href={`/app/clients/intake/${submissionId}?returnTo=${encodeURIComponent(returnResumo)}`}
                      className="mt-0.5 inline-block text-sm font-medium text-[var(--color-link)]"
                    >
                      Ver anamnese
                    </Link>
                  ) : null}
                </div>
                <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-sm">
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
            {item?.status !== "archived" ? (
              <Link
                href={`/app/appointments/new?clientId=${clientId}&returnTo=${encodeURIComponent(`${returnResumo}?tab=agenda`)}`}
              >
                <Button variant="secondary" className="min-h-10 px-3 text-sm">
                  <IconCalendarPlus className="mr-1.5 h-4 w-4" aria-hidden />
                  Agendar
                </Button>
              </Link>
            ) : null}
          </div>
          {loading && !item ? (
            <div className="space-y-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : appointments.length === 0 ? (
            <EmptyStateGuide
              title="Nenhuma sessão agendada"
              body={
                item?.status === "archived"
                  ? "Cliente arquivado — reative para agendar novas sessões."
                  : "Este cliente não tem compromissos futuros na agenda."
              }
              action={
                item?.status !== "archived" ? (
                  <Link
                    href={`/app/appointments/new?clientId=${clientId}&returnTo=${encodeURIComponent(`${returnResumo}?tab=agenda`)}`}
                  >
                    <Button>Agendar sessão</Button>
                  </Link>
                ) : undefined
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
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
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
                          // Processo de renovação — distinto do status do ciclo
                          // acima (programado/em andamento/encerrado).
                          activeCycleRenewalCase
                            ? `Renovação: ${renewalStatusLabel(activeCycleRenewalCase.display_status)}`
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
                      : item?.status === "archived"
                        ? undefined
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
                    {pastCycles.map((c) => {
                      const renewalCase = cycleRenewalCase(c.id, renewalCaseIndex);
                      return (
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
                            <span className="flex shrink-0 flex-wrap justify-end gap-1.5">
                              <Badge tone={cycleListStatusTone(c, todayIso)}>
                                {cycleListStatus(c, todayIso)}
                              </Badge>
                              {renewalCase ? (
                                <Badge tone={renewalStatusTone(renewalCase.display_status)}>
                                  {renewalStatusLabel(renewalCase.display_status)}
                                </Badge>
                              ) : null}
                            </span>
                          </Link>
                          {renewalCase?.successor_cycle_id ? (
                            <Link
                              href={`/app/cycles/${renewalCase.successor_cycle_id}`}
                              className="ml-3 mt-1 inline-block text-xs font-medium text-[var(--color-link)] hover:underline"
                            >
                              Ver ciclo renovado →
                            </Link>
                          ) : null}
                        </li>
                      );
                    })}
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
            {loading && !item ? (
              <Skeleton className="h-14 w-full" />
            ) : submissionId ? (
              <Link
                href={`/app/clients/intake/${submissionId}?returnTo=${encodeURIComponent(`${returnResumo}?tab=prontuario`)}`}
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
              {item?.status !== "archived" ? (
                <Link
                  href={`/app/clients/${clientId}/evaluations/new?returnTo=${encodeURIComponent(`${returnResumo}?tab=prontuario`)}`}
                  className="text-sm font-medium text-[var(--color-primary)]"
                >
                  Registrar avaliação
                </Link>
              ) : null}
            </div>

            {loading && !item ? (
              <Skeleton className="h-14 w-full" />
            ) : !evaluations.length ? (
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
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
                Em aberto
              </p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--color-ink)]">
                {formatBRL(pendingTotalCents)}
              </p>
            </div>
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
                Atrasadas
              </p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--color-danger)]">
                {overdueReceivables.length}
              </p>
            </div>
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
                Recebido (histórico)
              </p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--color-success)]">
                {formatBRL(receivedTotalCents)}
              </p>
            </div>
          </div>

          {loading && !item ? (
            <div className="space-y-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : receivables.length === 0 ? (
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

            if (loading && !item) {
              return (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              );
            }

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
          <RelationshipStateCard
            next={next}
            activeCycle={activeCycle}
            nextAppointment={nextAppointment}
            latestEvaluation={latestEvaluation}
            pendingReceivables={pendingReceivables}
            overdueReceivables={overdueReceivables}
            pendingTotalCents={pendingTotalCents}
            timeZone={timeZone}
            todayIso={todayIso}
          />

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
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-sm">
              <p className="text-sm font-semibold text-[var(--color-ink)]">
                Envie o formulário para {firstName(item.full_name)} completar o cadastro.
              </p>
              <div className="mt-3">
                <ClientIntakeInviteButton clientId={clientId} />
              </div>
            </div>
          ) : null}

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
                    <Link
                      href={`/app/clients/intake/${submissionId}?returnTo=${encodeURIComponent(returnResumo)}`}
                      className="text-[var(--color-link)]"
                    >
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

      {item ? (
        <ClientEditDrawer
          open={editOpen}
          client={item}
          onClose={() => setEditOpen(false)}
          onSaved={(updated) => {
            setItem(updated);
            setEditOpen(false);
          }}
        />
      ) : null}

      <span className="hidden">{safeReturnTo(returnResumo)}</span>
    </div>
  );
}
