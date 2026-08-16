"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  apiFetch,
  type Client,
  type ClientJourney,
  type ProfessionProfile,
} from "@/lib/api";
import { nomenclatureFor, t } from "@/lib/nomenclature";
import { BackLink } from "@/components/app/back-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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

export default function AccompanimentPreparePage() {
  const params = useParams<{ clientId: string }>();
  const [client, setClient] = useState<Client | null>(null);
  const [journey, setJourney] = useState<ClientJourney | null>(null);
  const [profession, setProfession] = useState<ProfessionProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sheet, setSheet] = useState<StepKey | null>(null);
  const returnBase = `/app/clients/${params.clientId}/accompaniment`;
  const terms = nomenclatureFor(profession?.profession_code);
  const checklist = journey?.accompaniment_checklist ?? {};
  const summaries = journey?.accompaniment_summaries ?? {};

  const load = useCallback(async () => {
    const [c, j, p] = await Promise.all([
      apiFetch<Client>(`/api/v1/clients/${params.clientId}`),
      apiFetch<ClientJourney>(`/api/v1/clients/${params.clientId}/journey`),
      apiFetch<ProfessionProfile>("/api/v1/organization/profession"),
    ]);
    if (c.error) setError(c.error.message);
    else setClient(c.data ?? null);
    if (j.error) setError(j.error.message);
    else setJourney(j.data ?? null);
    if (p.data) setProfession(p.data);
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
    setSheet(null);
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

  function primary(step: StepKey, value: string) {
    if (value === "done") {
      if (step === "cycle") {
        return { href: `/app/clients/${params.clientId}?tab=acompanhamento`, label: "Ver ciclo" };
      }
      if (step === "agenda") {
        return { href: `/app/agenda?clientId=${params.clientId}`, label: "Ver agenda" };
      }
      if (step === "plan") {
        return { href: `/app/clients/${params.clientId}?tab=accompaniment&focus=plan`, label: "Ver plano" };
      }
      return null;
    }
    if (value === "na" || value === "later") {
      return { action: () => setSheet(step), label: value === "later" ? "Continuar agora" : "Alterar decisão" };
    }
    if (step === "anamnesis") {
      return { action: () => void persist("anamnesis", "done"), label: "Marcar como analisada" };
    }
    if (step === "evaluation") {
      return { href: `/app/clients/${params.clientId}/evaluations/new?returnTo=${ret}`, label: "Registrar agora" };
    }
    if (step === "plan") {
      return { href: `/app/clients/${params.clientId}?tab=accompaniment&focus=plan&returnTo=${ret}`, label: `Criar ${t(terms, "plan_short")}` };
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
      </header>
      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}

      <ol className="divide-y divide-[var(--color-border)] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        {STEP_ORDER.map((step, index) => {
          const value = (checklist[step] ?? "todo") as Status;
          const action = primary(step, value);
          return (
            <li key={step} className="flex items-start gap-3 px-3 py-3">
              <span className="mt-0.5 w-5 text-center text-xs font-semibold text-[var(--color-ink-muted)]">
                {value === "done" ? "✓" : index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold text-[var(--color-ink)]">{titles[step]}</h2>
                  <Badge tone={statusTone(value)}>{statusLabel(value)}</Badge>
                </div>
                {summaries[step] ? (
                  <p className="mt-0.5 text-sm text-[var(--color-ink-muted)]">{summaries[step]}</p>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {action?.href ? (
                    <Link href={action.href}>
                      <Button>{action.label}</Button>
                    </Link>
                  ) : null}
                  {action?.action ? (
                    <Button
                      disabled={busy !== null}
                      onClick={action.action}
                    >
                      {action.label}
                    </Button>
                  ) : null}
                  {value === "todo" && step !== "anamnesis" && step !== "activate" ? (
                    <button
                      type="button"
                      className="text-sm font-medium text-[var(--color-ink-muted)] underline-offset-2 hover:underline"
                      onClick={() => setSheet(step)}
                    >
                      Outras opções
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {sheet ? (
        <div
          className="fixed inset-0 z-30 bg-black/40"
          role="presentation"
          onClick={() => setSheet(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="sheet-title"
            className="absolute inset-x-0 bottom-0 rounded-t-[var(--radius-lg)] bg-[var(--color-surface)] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="sheet-title" className="text-base font-semibold">
              Como deseja continuar?
            </h2>
            <div className="mt-3 grid gap-2">
              {sheet !== "anamnesis" ? (
                <Button variant="secondary" disabled={busy !== null} onClick={() => void persist(sheet, "later")}>
                  Fazer depois
                </Button>
              ) : null}
              {sheet !== "anamnesis" && sheet !== "activate" ? (
                <Button variant="secondary" disabled={busy !== null} onClick={() => void persist(sheet, "na")}>
                  Não se aplica
                </Button>
              ) : null}
              {sheet !== "anamnesis" ? (
                <Button variant="ghost" disabled={busy !== null} onClick={() => void persist(sheet, "done")}>
                  Marcar concluído
                </Button>
              ) : null}
              {(checklist[sheet] === "na" || checklist[sheet] === "later") ? (
                <Button variant="ghost" disabled={busy !== null} onClick={() => void persist(sheet, "todo")}>
                  Reconsiderar
                </Button>
              ) : null}
              <Button variant="ghost" onClick={() => setSheet(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
