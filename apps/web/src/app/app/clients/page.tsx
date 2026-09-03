"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  apiFetch,
  formatBRL,
  formatOrgDate,
  formatOrgDateTime,
  type Client,
  type Cycle,
  type HomeSummary,
  type IntakeLink,
  type IntakeSubmissionListItem,
  type NextAppointmentsByClient,
  type Receivable,
} from "@/lib/api";
import { useAuth } from "@/components/auth/auth-provider";
import { nomenclatureFor } from "@/lib/nomenclature";
import {
  ATTENTION_REASON_LABEL,
  buildClientRow,
  clientInitials,
  matchesView,
  mobileAttentionDetail,
  primaryAttentionReason,
  type ClientListView,
  type ClientRow,
} from "@/lib/client-list";
import { cycleListStatus } from "@/lib/cycle-period";
import { formatPhoneBR } from "@/lib/status-labels";
import { copyTextToClipboard } from "@/lib/clipboard";
import { ActionSheet } from "@/components/ui/action-sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockError } from "@/components/ui/block-error";
import {
  IconAlertCircle,
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

const VIEW_OPTIONS: { value: ClientListView; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "attention", label: "Atenção" },
  { value: "onboarding", label: "Onboarding" },
  { value: "renewal", label: "Renovação" },
  { value: "financial", label: "Financeiro" },
  { value: "no_accompaniment", label: "Sem acompanhamento" },
];

type SortKey = "name" | "attention" | "next_session";

function sortRows(rows: ClientRow[], sort: SortKey): ClientRow[] {
  const copy = [...rows];
  if (sort === "name") {
    copy.sort((a, b) => a.client.full_name.localeCompare(b.client.full_name, "pt-BR"));
  } else if (sort === "attention") {
    copy.sort((a, b) => {
      if (b.reasons.length !== a.reasons.length) return b.reasons.length - a.reasons.length;
      return a.client.full_name.localeCompare(b.client.full_name, "pt-BR");
    });
  } else if (sort === "next_session") {
    copy.sort((a, b) => {
      const aTime = a.nextAppointment ? new Date(a.nextAppointment.starts_at).getTime() : Infinity;
      const bTime = b.nextAppointment ? new Date(b.nextAppointment.starts_at).getTime() : Infinity;
      if (aTime !== bTime) return aTime - bTime;
      return a.client.full_name.localeCompare(b.client.full_name, "pt-BR");
    });
  }
  return copy;
}

function AttentionBadges({ row }: { row: ClientRow }) {
  if (!row.reasons.length) {
    return <span className="text-sm text-[var(--color-ink-muted)]">Em dia</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {row.reasons.map((reason) => (
        <Badge key={reason} tone={reason === "financial" ? "danger" : "warning"}>
          {ATTENTION_REASON_LABEL[reason]}
        </Badge>
      ))}
    </div>
  );
}

function AtendimentoCell({ row, today }: { row: ClientRow; today: string }) {
  const cycle = row.activeCycle ?? row.upcomingCycle;
  if (!cycle) {
    return <span className="text-sm text-[var(--color-ink-muted)]">Sem ciclo</span>;
  }
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-medium text-[var(--color-ink)]">
        {cycle.service_name || "Serviço"}
      </p>
      <p className="text-xs text-[var(--color-ink-muted)]">{cycleListStatus(cycle, today)}</p>
    </div>
  );
}

function AgendaCell({ row, timeZone }: { row: ClientRow; timeZone: string }) {
  if (!row.nextAppointment) {
    return <span className="text-sm text-[var(--color-ink-muted)]">Sem agendamento</span>;
  }
  const date = formatOrgDate(row.nextAppointment.starts_at, timeZone);
  const time = formatOrgDateTime(row.nextAppointment.starts_at, timeZone, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  return (
    <span className="text-sm text-[var(--color-ink)]">
      {date} · {time}
    </span>
  );
}

function EvolucaoCell({ row }: { row: ClientRow }) {
  const cycle = row.activeCycle;
  if (!cycle || cycle.lesson_count == null) {
    return <span className="text-sm text-[var(--color-ink-muted)]">—</span>;
  }
  return (
    <span className="text-sm tabular-nums text-[var(--color-ink)]">
      {cycle.lessons_completed ?? 0}/{cycle.lesson_count}
    </span>
  );
}

function FinanceiroCell({ row }: { row: ClientRow }) {
  if (row.pendingReceivablesCount === 0) {
    return <span className="text-sm text-[var(--color-ink-muted)]">Em dia</span>;
  }
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={`text-sm font-medium tabular-nums ${
          row.overdueReceivablesCount > 0 ? "text-[var(--color-danger)]" : "text-[var(--color-ink)]"
        }`}
      >
        {formatBRL(row.pendingReceivablesTotalCents)}
      </span>
      {row.overdueReceivablesCount > 0 ? <Badge tone="danger">Atrasado</Badge> : null}
    </span>
  );
}

function RenovacaoCell({ row }: { row: ClientRow }) {
  const cycle = row.activeCycle;
  if (!cycle) return <span className="text-sm text-[var(--color-ink-muted)]">—</span>;
  if (cycle.is_nearing_end && cycle.days_remaining != null) {
    return (
      <Badge tone="warning">
        {cycle.days_remaining} {cycle.days_remaining === 1 ? "dia" : "dias"}
      </Badge>
    );
  }
  return <span className="text-sm text-[var(--color-ink-muted)]">—</span>;
}

const GRID_COLUMNS =
  "grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,1.3fr)]";

function ClientTableRow({
  row,
  timeZone,
  today,
}: {
  row: ClientRow;
  timeZone: string;
  today: string;
}) {
  const { client } = row;
  return (
    <Link
      href={`/app/clients/${client.id}`}
      className={`grid ${GRID_COLUMNS} items-center gap-3 rounded-[var(--radius-md)] px-3 py-3 transition-colors hover:bg-[var(--color-surface-subtle)]`}
    >
      <span className="flex min-w-0 items-center gap-3">
        <span
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-subtle)] text-xs font-semibold text-[var(--color-primary)]"
          aria-hidden
        >
          {clientInitials(client.full_name) || <IconUser className="h-4 w-4" />}
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="truncate font-semibold text-[var(--color-ink)]">{client.full_name}</span>
            {client.status === "archived" ? <Badge tone="neutral">Arquivado</Badge> : null}
          </span>
          <span className="block truncate text-xs text-[var(--color-ink-muted)]">
            {formatPhoneBR(client.phone)}
          </span>
        </span>
      </span>
      <AtendimentoCell row={row} today={today} />
      <AgendaCell row={row} timeZone={timeZone} />
      <EvolucaoCell row={row} />
      <FinanceiroCell row={row} />
      <RenovacaoCell row={row} />
      <AttentionBadges row={row} />
    </Link>
  );
}

function ClientCard({
  row,
  timeZone,
  today,
}: {
  row: ClientRow;
  timeZone: string;
  today: string;
}) {
  const { client } = row;
  return (
    <Link
      href={`/app/clients/${client.id}`}
      className="flex min-h-16 items-center gap-3.5 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 shadow-sm transition-all hover:-translate-y-px hover:shadow-md"
    >
      <span
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-subtle)] text-sm font-semibold text-[var(--color-primary)]"
        aria-hidden
      >
        {clientInitials(client.full_name) || <IconUser className="h-4 w-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="truncate font-semibold text-[var(--color-ink)]">{client.full_name}</span>
          {client.status === "archived" ? <Badge tone="neutral">Arquivado</Badge> : null}
        </span>
        <span className="block truncate text-sm text-[var(--color-ink-muted)]">
          {row.nextAppointment
            ? `Próxima sessão · ${formatOrgDate(row.nextAppointment.starts_at, timeZone)} ${formatOrgDateTime(row.nextAppointment.starts_at, timeZone, {
                hour: "2-digit",
                minute: "2-digit",
                hourCycle: "h23",
              })}`
            : row.activeCycle
              ? cycleListStatus(row.activeCycle, today)
              : "Sem agendamento"}
        </span>
        {mobileAttentionDetail(row) ? (
          <span className="mt-1.5 inline-block">
            <Badge tone={primaryAttentionReason(row) === "financial" ? "danger" : "warning"}>
              {mobileAttentionDetail(row)}
            </Badge>
          </span>
        ) : null}
      </span>
      <IconChevronRight className="h-4 w-4 shrink-0 text-[var(--color-ink-subtle)]" />
    </Link>
  );
}

export default function ClientsPage() {
  const { me } = useAuth();
  const timeZone = me?.organization.timezone || "America/Sao_Paulo";
  const [items, setItems] = useState<Client[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [nextAppointments, setNextAppointments] = useState<NextAppointmentsByClient>({});
  const [today, setToday] = useState("");
  const [pendingIntakes, setPendingIntakes] = useState<IntakeSubmissionListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"active" | "archived">("active");
  const [view, setView] = useState<ClientListView>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("name");
  const terms = nomenclatureFor(me?.organization.profession_code);
  const title = terms.clients.charAt(0).toUpperCase() + terms.clients.slice(1);
  const addLabel = `Adicionar ${terms.client}`;
  const emptyTitle = `Nenhum ${terms.client} cadastrado`;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const [result, cycleRes, home, pendingRes, receivablesRes, nextApptRes] = await Promise.all([
        apiFetch<Client[]>(`/api/v1/clients?status=${statusFilter}`),
        apiFetch<Cycle[]>("/api/v1/cycles"),
        apiFetch<HomeSummary>("/api/v1/home/summary"),
        apiFetch<IntakeSubmissionListItem[]>("/api/v1/intake-submissions?status=pending_review"),
        apiFetch<Receivable[]>("/api/v1/receivables"),
        apiFetch<NextAppointmentsByClient>("/api/v1/agenda/next-appointments"),
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
      setReceivables(receivablesRes.data ?? []);
      setNextAppointments(nextApptRes.data ?? {});
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [statusFilter]);

  const pendingIntakeClientIds = useMemo(
    () => new Set(pendingIntakes.map((s) => s.client_id).filter((id): id is string => Boolean(id))),
    [pendingIntakes],
  );

  const rows = useMemo(() => {
    return items.map((client) =>
      buildClientRow(client, {
        cycles,
        receivables,
        nextAppointmentByClientId: nextAppointments,
        pendingIntakeClientIds,
        today,
      }),
    );
  }, [items, cycles, receivables, nextAppointments, pendingIntakeClientIds, today]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const byView = rows.filter((row) => matchesView(row, view));
    const byQuery = q ? byView.filter((row) => row.client.full_name.toLowerCase().includes(q)) : byView;
    return sortRows(byQuery, sort);
  }, [rows, view, query, sort]);

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

      <div className="space-y-3">
        <div className="flex gap-2">
          {(
            [
              ["active", "Ativos"],
              ["archived", "Arquivados"],
            ] as const
          ).map(([value, label]) => (
            <SegmentedToggle
              key={value}
              active={statusFilter === value}
              onClick={() => setStatusFilter(value)}
            >
              {label}
            </SegmentedToggle>
          ))}
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por situação">
          {VIEW_OPTIONS.map(({ value, label }) => {
            const count = value === "all" ? rows.length : rows.filter((r) => matchesView(r, value)).length;
            return (
              <SegmentedToggle key={value} active={view === value} onClick={() => setView(value)}>
                {label}
                {value !== "all" && count > 0 ? ` · ${count}` : ""}
              </SegmentedToggle>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {showSearch ? (
            <label className="block flex-1 min-w-[12rem]">
              <span className="sr-only">Buscar {terms.client}</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Buscar ${terms.client}`}
                className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm"
              />
            </label>
          ) : null}
          <label className="flex items-center gap-2 text-sm">
            <span className="text-[var(--color-ink-muted)]">Ordenar por</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="min-h-11 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm"
            >
              <option value="name">Nome</option>
              <option value="attention">Atenção</option>
              <option value="next_session">Próxima sessão</option>
            </select>
          </label>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : null}
      {error ? <BlockError message={error} /> : null}

      {!loading && !items.length ? (
        <EmptyState
          title={emptyTitle}
          description={`Cadastre um ${terms.client} manualmente ou envie um convite para ele preencher os dados.`}
        />
      ) : null}

      {!loading && items.length > 0 && !filtered.length ? (
        <EmptyState
          title="Nenhum resultado para este filtro"
          description="Tente outra situação ou limpe a busca."
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setView("all");
                setQuery("");
              }}
            >
              <IconAlertCircle className="mr-1.5 h-4 w-4" />
              Ver todos
            </Button>
          }
        />
      ) : null}

      {filtered.length > 0 ? (
        <>
          {/* Desktop / notebook: dense table */}
          <div className="hidden lg:block">
            <div
              className={`grid ${GRID_COLUMNS} gap-3 border-b border-[var(--color-border)] px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]`}
            >
              <span>{terms.client.charAt(0).toUpperCase() + terms.client.slice(1)}</span>
              <span>Atendimento</span>
              <span>Agenda</span>
              <span>Evolução</span>
              <span>Financeiro</span>
              <span>Renovação</span>
              <span>Atenção</span>
            </div>
            <div className="divide-y divide-[var(--color-border)]/60">
              {filtered.map((row) => (
                <ClientTableRow key={row.client.id} row={row} timeZone={timeZone} today={today} />
              ))}
            </div>
          </div>

          {/* Mobile / tablet: prioritized cards */}
          <ul className="space-y-2.5 lg:hidden">
            {filtered.map((row) => (
              <li key={row.client.id}>
                <ClientCard row={row} timeZone={timeZone} today={today} />
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
