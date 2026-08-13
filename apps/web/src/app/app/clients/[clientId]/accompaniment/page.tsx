"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  apiFetch,
  type Client,
  type ClientJourney,
  type ProfessionProfile,
} from "@/lib/api";
import { nomenclatureFor, safeReturnTo, t } from "@/lib/nomenclature";
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

export default function AccompanimentPreparePage() {
  const params = useParams<{ clientId: string }>();
  const search = useSearchParams();
  const [client, setClient] = useState<Client | null>(null);
  const [journey, setJourney] = useState<ClientJourney | null>(null);
  const [profession, setProfession] = useState<ProfessionProfile | null>(null);
  const [checklist, setChecklist] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const returnBase = `/app/clients/${params.clientId}/accompaniment`;

  const terms = nomenclatureFor(profession?.profession_code);

  const load = useCallback(async () => {
    const [c, j, p] = await Promise.all([
      apiFetch<Client>(`/api/v1/clients/${params.clientId}`),
      apiFetch<ClientJourney>(`/api/v1/clients/${params.clientId}/journey`),
      apiFetch<ProfessionProfile>("/api/v1/organization/profession"),
    ]);
    if (c.error) setError(c.error.message);
    else setClient(c.data ?? null);
    if (j.data) {
      setJourney(j.data);
      const base = j.data.accompaniment_checklist ?? {
        anamnesis: "done",
        evaluation: "todo",
        plan: "todo",
        cycle: "todo",
        agenda: "todo",
        routine: "todo",
        activate: "todo",
      };
      const done = search.get("done");
      if (done && STEP_ORDER.includes(done as StepKey)) {
        setChecklist({ ...base, [done]: "done" });
        setInfo(`Etapa atualizada: ${done}`);
      } else {
        setChecklist(base);
      }
    }
    if (p.data) setProfession(p.data);
  }, [params.clientId, search]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount/remote hydrate
    void load();
  }, [load]);

  function mark(step: StepKey, value: "done" | "later" | "na" | "todo") {
    setChecklist((prev) => ({ ...prev, [step]: value }));
  }

  const explanations: Record<StepKey, { title: string; body: string }> = {
    anamnesis: {
      title: terms.intake_form.charAt(0).toUpperCase() + terms.intake_form.slice(1),
      body: "Confirme a análise do formulário e registre observações internas, sem diagnóstico.",
    },
    evaluation: {
      title: t(terms, "evaluation").charAt(0).toUpperCase() + t(terms, "evaluation").slice(1),
      body: "A avaliação registra o ponto de partida e a evolução do aluno.",
    },
    plan: {
      title: t(terms, "plan").charAt(0).toUpperCase() + t(terms, "plan").slice(1),
      body: "O plano define o que será realizado durante o acompanhamento.",
    },
    cycle: {
      title: "Ciclo",
      body: "O ciclo define período, quantidade de encontros, serviço e valor.",
    },
    agenda: {
      title: "Agenda",
      body: "A agenda define quando os atendimentos acontecerão.",
    },
    routine: {
      title: "Rotina",
      body: "Organize os dias em que você revisa planos e envia feedbacks.",
    },
    activate: {
      title: "Ativar acompanhamento",
      body: "Revise plano, ciclo, agenda e próxima revisão antes de ativar.",
    },
  };

  function statusTone(value: string | undefined) {
    if (value === "done") return "success" as const;
    if (value === "later") return "warning" as const;
    if (value === "na") return "neutral" as const;
    return "info" as const;
  }

  function statusLabel(value: string | undefined) {
    if (value === "done") return "Concluído";
    if (value === "later") return "Depois";
    if (value === "na") return "Não se aplica";
    return "Pendente";
  }

  const ret = encodeURIComponent(returnBase);

  return (
    <div className="space-y-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] animate-fade-up">
      <BackLink href={`/app/clients/${params.clientId}`} label="Voltar à ficha" />
      <header className="space-y-1">
        <h1 className="h-display text-3xl text-[var(--color-ink)]">
          Preparar {t(terms, "accompaniment")}
        </h1>
        <p className="text-sm text-[var(--color-ink-muted)]">
          {client?.full_name ?? "Carregando…"}
          {journey?.stage_label ? ` · ${journey.stage_label}` : ""}
        </p>
      </header>
      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
      {info ? (
        <p role="status" className="text-sm text-[var(--color-success)]">
          {info}
        </p>
      ) : null}

      <ol className="space-y-3">
        {STEP_ORDER.map((step, index) => {
          const meta = explanations[step];
          const value = checklist[step] ?? "todo";
          return (
            <li
              key={step}
              className="space-y-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-[var(--color-ink-muted)]">
                  {index + 1}
                </span>
                <h2 className="text-base font-semibold text-[var(--color-ink)]">{meta.title}</h2>
                <Badge tone={statusTone(value)}>{statusLabel(value)}</Badge>
              </div>
              <p className="text-sm text-[var(--color-ink-muted)]">{meta.body}</p>
              <div className="flex flex-wrap gap-2">
                {step === "evaluation" ? (
                  <Link
                    href={`/app/clients/${params.clientId}/evaluations/new?returnTo=${ret}`}
                  >
                    <Button>Registrar agora</Button>
                  </Link>
                ) : null}
                {step === "plan" ? (
                  <Link href={`/app/clients/${params.clientId}?tab=accompaniment&focus=plan&returnTo=${ret}`}>
                    <Button>Criar {t(terms, "plan_short")}</Button>
                  </Link>
                ) : null}
                {step === "cycle" ? (
                  <Link
                    href={`/app/cycles/new?clientId=${params.clientId}&returnTo=${ret}`}
                  >
                    <Button>Criar ciclo</Button>
                  </Link>
                ) : null}
                {step === "agenda" ? (
                  <Link href={`/app/agenda?clientId=${params.clientId}&returnTo=${ret}`}>
                    <Button>Abrir agenda</Button>
                  </Link>
                ) : null}
                {step === "routine" ? (
                  <Link href={`/app/routines?returnTo=${ret}`}>
                    <Button>Configurar rotina</Button>
                  </Link>
                ) : null}
                {step === "anamnesis" ? (
                  <Button variant="secondary" onClick={() => mark("anamnesis", "done")}>
                    Marcar como analisada
                  </Button>
                ) : null}
                {step !== "activate" && step !== "anamnesis" ? (
                  <>
                    <Button variant="secondary" onClick={() => mark(step, "later")}>
                      Fazer depois
                    </Button>
                    <Button variant="ghost" onClick={() => mark(step, "na")}>
                      Não se aplica
                    </Button>
                    <Button variant="ghost" onClick={() => mark(step, "done")}>
                      Marcar concluído
                    </Button>
                  </>
                ) : null}
                {step === "activate" ? (
                  <Button
                    onClick={() => {
                      const pending = STEP_ORDER.slice(0, -1).some(
                        (k) => (checklist[k] ?? "todo") === "todo",
                      );
                      if (pending) {
                        setInfo(
                          "Preparação incompleta salva. A próxima ação continua na ficha e em Hoje.",
                        );
                        mark("activate", "later");
                        return;
                      }
                      mark("activate", "done");
                      setInfo("Acompanhamento pronto para ativação.");
                    }}
                  >
                    Ativar acompanhamento
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      <Link href={safeReturnTo(`/app/clients/${params.clientId}`) || `/app/clients/${params.clientId}`}>
        <Button fullWidth variant="secondary">
          Voltar à ficha
        </Button>
      </Link>
    </div>
  );
}
