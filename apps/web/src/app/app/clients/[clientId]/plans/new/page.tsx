"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch, type Client, type ProfessionProfile, type Protocol } from "@/lib/api";
import { nomenclatureFor, safeReturnTo, t } from "@/lib/nomenclature";
import { protocolStatusLabel } from "@/lib/status-labels";
import { BackLink } from "@/components/app/back-link";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/text-area";
import { TextField } from "@/components/ui/text-field";

const DURATION_PRESETS = [12, 16, 20, 22];
const REVIEW_PRESETS = [28, 42, 56];
const FEEDBACK_PRESETS = [7, 15, 30];

export default function PlanEditorPage() {
  const params = useParams<{ clientId: string; protocolId?: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const protocolId = params.protocolId;
  const returnTo =
    safeReturnTo(search.get("returnTo")) || `/app/clients/${params.clientId}?tab=acompanhamento`;
  const [client, setClient] = useState<Client | null>(null);
  const [profession, setProfession] = useState<ProfessionProfile | null>(null);
  const [title, setTitle] = useState("");
  const [objective, setObjective] = useState("");
  const [notes, setNotes] = useState("");
  const [durationWeeks, setDurationWeeks] = useState<number | "custom" | "none">(16);
  const [customWeeks, setCustomWeeks] = useState("18");
  const [reviewDays, setReviewDays] = useState<number | "none">(28);
  const [feedbackDays, setFeedbackDays] = useState<number | "none">(15);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState<Protocol | null>(null);

  const terms = nomenclatureFor(profession?.profession_code);

  useEffect(() => {
    void (async () => {
      const [c, p] = await Promise.all([
        apiFetch<Client>(`/api/v1/clients/${params.clientId}`),
        apiFetch<ProfessionProfile>("/api/v1/organization/profession"),
      ]);
      if (c.data) setClient(c.data);
      if (p.data) setProfession(p.data);
      if (protocolId) {
        const proto = await apiFetch<Protocol>(`/api/v1/protocols/${protocolId}`);
        if (proto.data) {
          setLoaded(proto.data);
          setTitle(proto.data.title);
          setObjective(proto.data.objective || "");
          const content = proto.data.versions?.at(-1)?.content_json as { notes?: string } | undefined;
          setNotes(content?.notes || "");
          if (proto.data.duration_value && proto.data.duration_unit === "weeks") {
            setDurationWeeks(
              DURATION_PRESETS.includes(proto.data.duration_value)
                ? proto.data.duration_value
                : "custom",
            );
            setCustomWeeks(String(proto.data.duration_value));
          } else if (!proto.data.duration_value) {
            setDurationWeeks("none");
          }
          setReviewDays(proto.data.review_recurrence_days ?? "none");
          setFeedbackDays(proto.data.feedback_interval_days ?? "none");
        }
      }
    })();
  }, [params.clientId, protocolId]);

  function durationPayload() {
    if (durationWeeks === "none") return { duration_value: null, duration_unit: null };
    const value = durationWeeks === "custom" ? Number(customWeeks) : durationWeeks;
    return { duration_value: value, duration_unit: "weeks" as const };
  }

  async function save(publish: boolean) {
    if (!title.trim()) {
      setError("Informe o título.");
      return;
    }
    setBusy(true);
    setError(null);
    const body = {
      title: title.trim(),
      protocol_type: "free",
      client_id: params.clientId,
      objective: objective.trim() || null,
      content_json: { notes: notes.trim() },
      review_recurrence_days: reviewDays === "none" ? null : reviewDays,
      feedback_interval_days: feedbackDays === "none" ? null : feedbackDays,
      ...durationPayload(),
    };
    let result;
    if (loaded) {
      result = await apiFetch<Protocol>(`/api/v1/protocols/${loaded.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    } else {
      result = await apiFetch<Protocol>("/api/v1/protocols", {
        method: "POST",
        body: JSON.stringify(body),
      });
    }
    if (result.error || !result.data) {
      setBusy(false);
      setError(result.error?.message || "Não foi possível salvar.");
      return;
    }
    if (publish) {
      const pub = await apiFetch<Protocol>(`/api/v1/protocols/${result.data.id}/publish`, {
        method: "POST",
        body: "{}",
      });
      setBusy(false);
      if (pub.error) {
        setError(pub.error.message);
        return;
      }
    } else {
      setBusy(false);
    }
    router.replace(returnTo);
  }

  return (
    <div className="space-y-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] animate-fade-up">
      <BackLink href={returnTo} label="Voltar" />
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {loaded ? `Editar ${t(terms, "plan")}` : `Novo ${t(terms, "plan")}`}
        </h1>
        <p className="text-sm text-[var(--color-ink-muted)]">{client?.full_name}</p>
      </header>
      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}

      <TextField label="Título" value={title} onChange={(e) => setTitle(e.target.value)} />
      <TextField
        label="Objetivo (opcional)"
        value={objective}
        onChange={(e) => setObjective(e.target.value)}
      />
      <TextArea
        label="Descrição"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={5}
      />

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Por quanto tempo este planejamento será utilizado?</legend>
        <div className="flex flex-wrap gap-2">
          {DURATION_PRESETS.map((w) => (
            <Button
              key={w}
              type="button"
              variant={durationWeeks === w ? "secondary" : "ghost"}
              onClick={() => setDurationWeeks(w)}
            >
              {w} semanas
            </Button>
          ))}
          <Button type="button" variant={durationWeeks === "custom" ? "secondary" : "ghost"} onClick={() => setDurationWeeks("custom")}>
            Personalizar
          </Button>
          <Button type="button" variant={durationWeeks === "none" ? "secondary" : "ghost"} onClick={() => setDurationWeeks("none")}>
            Sem data definida
          </Button>
        </div>
        {durationWeeks === "custom" ? (
          <TextField
            label="Semanas"
            value={customWeeks}
            onChange={(e) => setCustomWeeks(e.target.value)}
          />
        ) : null}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Com que frequência você pretende revisar este plano?</legend>
        <p className="text-xs text-[var(--color-ink-muted)]">
          As revisões servem para pequenos ajustes durante o planejamento.
        </p>
        <div className="flex flex-wrap gap-2">
          {REVIEW_PRESETS.map((d) => (
            <Button
              key={d}
              type="button"
              variant={reviewDays === d ? "secondary" : "ghost"}
              onClick={() => setReviewDays(d)}
            >
              A cada {d / 7} semanas
            </Button>
          ))}
          <Button type="button" variant={reviewDays === "none" ? "secondary" : "ghost"} onClick={() => setReviewDays("none")}>
            Sem revisão programada
          </Button>
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Com que frequência deseja acompanhar este aluno?</legend>
        <div className="flex flex-wrap gap-2">
          {FEEDBACK_PRESETS.map((d) => (
            <Button
              key={d}
              type="button"
              variant={feedbackDays === d ? "secondary" : "ghost"}
              onClick={() => setFeedbackDays(d)}
            >
              {d === 7 ? "Toda semana" : `A cada ${d} dias`}
            </Button>
          ))}
          <Button type="button" variant={feedbackDays === "none" ? "secondary" : "ghost"} onClick={() => setFeedbackDays("none")}>
            Não programar agora
          </Button>
        </div>
      </fieldset>

      {loaded?.milestones?.length ? (
        <div className="text-sm text-[var(--color-ink-muted)]">
          <p className="font-medium text-[var(--color-ink)]">Marcos</p>
          <ul className="mt-1 list-disc pl-4">
            {loaded.milestones.map((m) => (
              <li key={`${m.kind}-${m.index}-${m.due_on}`}>
                {m.kind === "plan_review"
                  ? `${t(terms, "plan_review")} ${m.index}`
                  : m.kind === "plan_ending"
                    ? t(terms, "plan_ending")
                    : t(terms, "feedback")}{" "}
                · {m.due_on}
              </li>
            ))}
          </ul>
          {loaded.status_label || loaded.status ? (
            <p className="mt-2">{protocolStatusLabel(loaded.status)}</p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <Button disabled={busy} onClick={() => void save(true)}>
          Publicar
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => void save(false)}>
          Salvar rascunho
        </Button>
        <Link href={returnTo} className="text-center text-sm text-[var(--color-link)]">
          Cancelar
        </Link>
      </div>
    </div>
  );
}
