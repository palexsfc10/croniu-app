"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  apiFetch,
  type Client,
  type ClientJourney,
} from "@/lib/api";
import { useAuth } from "@/components/auth/auth-provider";
import { nomenclatureFor, t } from "@/lib/nomenclature";
import { useMediaQuery } from "@/lib/use-media-query";
import { dropdownPanelClass } from "@/lib/use-dropdown";
import { BackLink } from "@/components/app/back-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MenuItem } from "@/components/ui/menu-item";
import { ActionSheet } from "@/components/ui/action-sheet";

type StepKey =
  | "anamnesis"
  | "evaluation"
  | "plan"
  | "cycle"
  | "agenda"
  | "routine"
  | "activate";

const STEP_ORDER: StepKey[] = [
  "anamnesis",
  "evaluation",
  "plan",
  "cycle",
  "agenda",
  "routine",
  "activate",
];

type Status = "todo" | "done" | "later" | "na";

/** Desktop: a small popover anchored to whatever trigger opened it — never
 * the full-width sheet this used to always render, regardless of screen
 * size. Mobile: the same options, still a bottom sheet. Both share one
 * open/close state and the same option list; only the shell differs. */
function StepOptionsMenu({
  step,
  status,
  busy,
  onDecide,
  trigger,
}: {
  step: StepKey;
  status: Status;
  busy: boolean;
  onDecide: (status: Status) => void;
  trigger: (props: { onClick: () => void; ariaExpanded?: boolean }) => ReactNode;
}) {
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !isDesktop) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, isDesktop]);

  function choose(next: Status) {
    onDecide(next);
    setOpen(false);
  }

  const canReconsider = status === "na" || status === "later";
  const titleId = `options-${step}-title`;
  const options = (
    <>
      <MenuItem role={isDesktop ? "menuitem" : undefined} disabled={busy} onClick={() => choose("later")}>
        Fazer depois
      </MenuItem>
      <MenuItem role={isDesktop ? "menuitem" : undefined} disabled={busy} onClick={() => choose("na")}>
        Não se aplica
      </MenuItem>
      <MenuItem role={isDesktop ? "menuitem" : undefined} disabled={busy} onClick={() => choose("done")}>
        Marcar concluído
      </MenuItem>
      {canReconsider ? (
        <MenuItem role={isDesktop ? "menuitem" : undefined} disabled={busy} onClick={() => choose("todo")}>
          Reconsiderar
        </MenuItem>
      ) : null}
    </>
  );

  if (isDesktop) {
    return (
      <div className="relative inline-block" ref={rootRef}>
        {trigger({ onClick: () => setOpen((v) => !v), ariaExpanded: open })}
        {open ? (
          <div role="menu" aria-label="Outras opções" className={dropdownPanelClass("left")}>
            {options}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <>
      {trigger({ onClick: () => setOpen(true) })}
      <ActionSheet open={open} onClose={() => setOpen(false)} labelledBy={titleId}>
        <h2 id={titleId} className="text-base font-semibold text-[var(--color-ink)]">
          Como deseja continuar?
        </h2>
        <div className="mt-3 flex flex-col gap-1">
          {options}
          <MenuItem onClick={() => setOpen(false)}>Cancelar</MenuItem>
        </div>
      </ActionSheet>
    </>
  );
}

export default function AccompanimentPreparePage() {
  const params = useParams<{ clientId: string }>();
  const { me } = useAuth();
  const [client, setClient] = useState<Client | null>(null);
  const [journey, setJourney] = useState<ClientJourney | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const returnBase = `/app/clients/${params.clientId}/accompaniment`;
  const terms = nomenclatureFor(me?.organization.profession_code);
  const checklist = journey?.accompaniment_checklist ?? {};
  const summaries = journey?.accompaniment_summaries ?? {};

  const load = useCallback(async () => {
    const [c, j, sub] = await Promise.all([
      apiFetch<Client>(`/api/v1/clients/${params.clientId}`),
      apiFetch<ClientJourney>(`/api/v1/clients/${params.clientId}/journey`),
      apiFetch<Array<{ id: string }>>(`/api/v1/intake-submissions?client_id=${params.clientId}`),
    ]);
    if (c.error) setError(c.error.message);
    else setClient(c.data ?? null);
    if (j.error) setError(j.error.message);
    else setJourney(j.data ?? null);
    if (sub.data?.length) setSubmissionId(sub.data[0].id);
  }, [params.clientId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount/remote hydrate
    void load();
  }, [load]);

  async function persist(step: StepKey, status: Status) {
    setBusy(`${step}:${status}`);
    setError(null);
    const result = await apiFetch<ClientJourney>(
      `/api/v1/clients/${params.clientId}/journey/accompaniment-step`,
      { method: "PATCH", body: JSON.stringify({ step, status }) },
    );
    setBusy(null);
    if (result.error) {
      setError(result.error.message);
      await load();
      return;
    }
    setJourney(result.data ?? null);
  }

  function statusTone(value: string | undefined) {
    if (value === "done") return "success" as const;
    if (value === "later") return "warning" as const;
    if (value === "na") return "neutral" as const;
    return "info" as const;
  }

  function statusLabel(value: string | undefined) {
    if (value === "done") return "Concluído";
    if (value === "later") return "Adiado";
    if (value === "na") return "Não se aplica";
    return "Pendente";
  }

  const titles: Record<StepKey, string> = {
    anamnesis: terms.intake_form.charAt(0).toUpperCase() + terms.intake_form.slice(1),
    evaluation: t(terms, "evaluation").charAt(0).toUpperCase() + t(terms, "evaluation").slice(1),
    plan: t(terms, "plan").charAt(0).toUpperCase() + t(terms, "plan").slice(1),
    cycle: "Ciclo",
    agenda: "Agenda",
    routine: "Rotina",
    activate: "Ativar acompanhamento",
  };

  const ret = encodeURIComponent(returnBase);
  const defined = journey?.progress_defined ?? STEP_ORDER.filter((k) => k !== "activate" && checklist[k] && checklist[k] !== "todo").length;
  const total = journey?.progress_total ?? 6;
  const progressPercent = total > 0 ? Math.max(0, Math.min(100, Math.round((defined / total) * 100))) : 0;
  // The backend (resolve_accompaniment) is the single source of truth for
  // which step is "next" — it knows things this page can't derive from
  // the checklist alone, like evaluation never being presentable as next
  // before a cycle exists. No parallel STEP_ORDER-based re-derivation.
  const nextStepKey = (journey?.next_step as StepKey | null | undefined) ?? null;

  function primary(step: StepKey, value: string) {
    if (value === "done") {
      if (step === "anamnesis") {
        return submissionId
          ? { href: `/app/clients/intake/${submissionId}?returnTo=${ret}`, label: "Ver respostas" }
          : null;
      }
      if (step === "cycle") {
        return { href: `/app/clients/${params.clientId}?tab=plano`, label: "Ver ciclo" };
      }
      if (step === "agenda") {
        return { href: `/app/agenda?clientId=${params.clientId}`, label: "Ver agenda" };
      }
      if (step === "plan") {
        return { href: `/app/clients/${params.clientId}?tab=plano`, label: "Ver plano" };
      }
      return null;
    }
    if (value === "na" || value === "later") {
      // Rendered via StepOptionsMenu directly (its trigger IS this
      // primary button) — no plain action/href to return here.
      return null;
    }
    if (step === "anamnesis") {
      // A real submission exists and is waiting for review — that's the
      // action. Otherwise there is nothing to review yet: the useful next
      // step is getting the intake link to this client, not a button that
      // marks an empty form "analisada".
      return submissionId
        ? { action: () => void persist("anamnesis", "done"), label: "Marcar como analisada" }
        : { href: "/app/clients/intake", label: "Compartilhar link" };
    }
    if (step === "evaluation") {
      return { href: `/app/clients/${params.clientId}/evaluations/new?returnTo=${ret}`, label: "Registrar agora" };
    }
    if (step === "plan") {
      return { href: `/app/clients/${params.clientId}/plans/new?returnTo=${ret}`, label: `Criar ${t(terms, "plan_short")}` };
    }
    if (step === "cycle") {
      return { href: `/app/cycles/new?clientId=${params.clientId}&returnTo=${ret}`, label: "Criar ciclo" };
    }
    if (step === "agenda") {
      return { href: `/app/agenda?clientId=${params.clientId}&returnTo=${ret}`, label: "Organizar agenda" };
    }
    if (step === "routine") {
      return { href: `/app/routines?clientId=${params.clientId}&returnTo=${ret}`, label: "Configurar rotina" };
    }
    return { action: () => void persist("activate", "done"), label: "Ativar acompanhamento" };
  }

  return (
    <div className="space-y-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] animate-fade-up">
      <BackLink href={`/app/clients/${params.clientId}`} label="Voltar à ficha" />
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">
          Preparar {t(terms, "accompaniment")}
        </h1>
        <p className="text-sm text-[var(--color-ink-muted)]">
          {client?.full_name ?? "Carregando…"}
        </p>
        <p className="text-sm text-[var(--color-ink-muted)]">
          {defined} de {total} etapas definidas
        </p>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-subtle)]"
          role="progressbar"
          aria-valuenow={progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Preparação do acompanhamento: ${progressPercent}% concluída`}
        >
          <div
            className="h-full rounded-full bg-[var(--color-primary)] transition-[width]"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </header>
      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}

      <ol className="space-y-2">
        {STEP_ORDER.map((step, index) => {
          const value = (checklist[step] ?? "todo") as Status;
          const action = primary(step, value);
          const isNext = step === nextStepKey;

          if (value === "done") {
            return (
              <li
                key={step}
                data-testid={`checklist-row-${step}`}
                className="flex flex-wrap items-start gap-x-3 gap-y-2 rounded-[var(--radius-md)] border border-[var(--color-border)]/60 bg-[var(--color-surface)] px-3 py-2 opacity-80"
              >
                <span
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-success-subtle)] text-xs font-semibold text-[var(--color-success)]"
                  aria-hidden
                >
                  ✓
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[var(--color-ink)]">{titles[step]}</p>
                  {summaries[step] ? (
                    <p className="text-sm text-[var(--color-ink-muted)]">{summaries[step]}</p>
                  ) : null}
                </div>
                <div
                  data-testid={`checklist-actions-${step}`}
                  className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-3"
                >
                  {action?.href ? (
                    <Link
                      href={action.href}
                      className="flex min-h-11 items-center text-sm font-medium text-[var(--color-link)] underline-offset-2 hover:underline"
                    >
                      {action.label}
                    </Link>
                  ) : null}
                  <Badge tone={statusTone(value)}>{statusLabel(value)}</Badge>
                </div>
              </li>
            );
          }

          return (
            <li
              key={step}
              data-testid={`checklist-row-${step}`}
              className={[
                "flex items-start gap-3 rounded-[var(--radius-md)] border px-3 py-3",
                isNext
                  ? "border-[var(--color-primary)]/40 bg-[var(--color-primary-subtle)]/30 shadow-[0_1px_3px_rgba(15,15,20,0.06)]"
                  : "border-[var(--color-border)] bg-[var(--color-surface)]",
              ].join(" ")}
            >
              <span
                className={[
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  isNext
                    ? "bg-[var(--color-primary)] text-white"
                    : "text-[var(--color-ink-muted)]",
                ].join(" ")}
              >
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-[var(--color-ink)]">{titles[step]}</h2>
                  {isNext ? (
                    <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-primary)]">
                      Próximo passo
                    </span>
                  ) : (
                    <Badge tone={statusTone(value)}>{statusLabel(value)}</Badge>
                  )}
                </div>
                {summaries[step] ? (
                  <p className="mt-0.5 text-sm text-[var(--color-ink-muted)]">{summaries[step]}</p>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {step === "anamnesis" && value === "todo" && submissionId ? (
                    // The professional must be able to open and read the
                    // anamnesis before deciding it's analisada — never just
                    // a button that marks it reviewed sight unseen.
                    <Link href={`/app/clients/intake/${submissionId}?returnTo=${ret}`}>
                      <Button variant="secondary">Abrir anamnese</Button>
                    </Link>
                  ) : null}
                  {value === "na" || value === "later" ? (
                    <StepOptionsMenu
                      step={step}
                      status={value}
                      busy={busy !== null}
                      onDecide={(next) => void persist(step, next)}
                      trigger={({ onClick }) => (
                        <Button variant={isNext ? "primary" : "secondary"} disabled={busy !== null} onClick={onClick}>
                          {value === "later" ? "Continuar agora" : "Alterar decisão"}
                        </Button>
                      )}
                    />
                  ) : (
                    <>
                      {action?.href ? (
                        <Link href={action.href}>
                          <Button variant={isNext ? "primary" : "secondary"}>{action.label}</Button>
                        </Link>
                      ) : null}
                      {action?.action ? (
                        <Button
                          variant={isNext ? "primary" : "secondary"}
                          disabled={busy !== null}
                          onClick={action.action}
                        >
                          {action.label}
                        </Button>
                      ) : null}
                    </>
                  )}
                  {value === "todo" && step !== "activate" ? (
                    <StepOptionsMenu
                      step={step}
                      status={value}
                      busy={busy !== null}
                      onDecide={(next) => void persist(step, next)}
                      trigger={({ onClick, ariaExpanded }) => (
                        <button
                          type="button"
                          className="text-sm font-medium text-[var(--color-ink-muted)] underline-offset-2 hover:underline"
                          aria-haspopup="menu"
                          aria-expanded={ariaExpanded}
                          onClick={onClick}
                        >
                          Outras opções
                        </button>
                      )}
                    />
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
