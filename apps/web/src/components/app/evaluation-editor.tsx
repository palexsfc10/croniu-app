"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  apiFetch,
  type ClientEvaluation,
  type EvaluationCriterionInput,
} from "@/lib/api";
import { useAuth } from "@/components/auth/auth-provider";
import { evaluationGuidance } from "@/lib/form-guidance";
import { SuggestionChips } from "@/components/ui/suggestion-chips";
import { FormSectionIntro } from "@/components/ui/form-section-intro";
import { FieldHint } from "@/components/ui/field-hint";
import { BackLink } from "@/components/app/back-link";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/text-area";
import { TextField } from "@/components/ui/text-field";

const SCALE_HINT =
  "Escala 1–5: 1 pouco desenvolvido · 3 em evolução · 5 consolidado. Critérios são opcionais.";

type FormState = {
  title: string;
  evaluated_from: string;
  evaluated_to: string;
  summary: string;
  achievements: string;
  attention_points: string;
  next_goals: string;
  client_message: string;
  private_notes: string;
  criteria: EvaluationCriterionInput[];
};

function emptyForm(): FormState {
  return {
    title: "",
    evaluated_from: "",
    evaluated_to: "",
    summary: "",
    achievements: "",
    attention_points: "",
    next_goals: "",
    client_message: "",
    private_notes: "",
    criteria: [],
  };
}

function fromEvaluation(item: ClientEvaluation): FormState {
  return {
    title: item.title,
    evaluated_from: item.evaluated_from ?? "",
    evaluated_to: item.evaluated_to ?? "",
    summary: item.summary ?? "",
    achievements: item.achievements ?? "",
    attention_points: item.attention_points ?? "",
    next_goals: item.next_goals ?? "",
    client_message: item.client_message ?? "",
    private_notes: item.private_notes ?? "",
    criteria: item.criteria.map((c, index) => ({
      name: c.name,
      score: c.score,
      scale_max: c.scale_max,
      comment: c.comment,
      sort_order: c.sort_order ?? index,
    })),
  };
}

function toPayload(form: FormState) {
  return {
    title: form.title.trim(),
    evaluated_from: form.evaluated_from || null,
    evaluated_to: form.evaluated_to || null,
    summary: form.summary.trim() || null,
    achievements: form.achievements.trim() || null,
    attention_points: form.attention_points.trim() || null,
    next_goals: form.next_goals.trim() || null,
    client_message: form.client_message.trim() || null,
    private_notes: form.private_notes.trim() || null,
    criteria: form.criteria.map((c, index) => ({
      name: c.name.trim(),
      score: c.score ?? null,
      scale_max: c.scale_max ?? 5,
      comment: c.comment?.trim() || null,
      sort_order: index,
    })),
  };
}

type Props = {
  clientId: string;
  evaluationId?: string;
  initial?: ClientEvaluation | null;
};

export function EvaluationEditor({ clientId, evaluationId, initial = null }: Props) {
  const router = useRouter();
  const { me } = useAuth();
  const [form, setForm] = useState<FormState>(
    initial ? fromEvaluation(initial) : emptyForm(),
  );
  const [status, setStatus] = useState(initial?.status ?? "draft");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(evaluationId ?? initial?.id ?? null);
  const [achievementDraft, setAchievementDraft] = useState("");
  const guide = evaluationGuidance(me?.organization.profession_code);
  const achievementItems = form.achievements
    ? form.achievements.split("\n").map((row) => row.trim()).filter(Boolean)
    : [];

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateCriterion(index: number, patch: Partial<EvaluationCriterionInput>) {
    setForm((prev) => ({
      ...prev,
      criteria: prev.criteria.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    }));
  }

  function addCriterion() {
    setForm((prev) => ({
      ...prev,
      criteria: [
        ...prev.criteria,
        { name: "", score: null, scale_max: 5, comment: null, sort_order: prev.criteria.length },
      ],
    }));
  }

  function removeCriterion(index: number) {
    setForm((prev) => ({
      ...prev,
      criteria: prev.criteria.filter((_, i) => i !== index),
    }));
  }

  function moveCriterion(index: number, direction: -1 | 1) {
    setForm((prev) => {
      const next = [...prev.criteria];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...prev, criteria: next };
    });
  }

  async function saveDraft(): Promise<string | null> {
    setBusy(true);
    setError(null);
    const payload = toPayload(form);
    if (!payload.title || payload.title.length < 2) {
      setBusy(false);
      setError("Informe um título.");
      return null;
    }
    if (
      payload.evaluated_from &&
      payload.evaluated_to &&
      payload.evaluated_from > payload.evaluated_to
    ) {
      setBusy(false);
      setError("A data inicial do período avaliado precisa ser anterior ou igual à data final.");
      return null;
    }
    const result = currentId
      ? await apiFetch<ClientEvaluation>(`/api/v1/evaluations/${currentId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        })
      : await apiFetch<ClientEvaluation>(`/api/v1/clients/${clientId}/evaluations`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return null;
    }
    const id = result.data!.id;
    setCurrentId(id);
    setStatus(result.data!.status);
    if (!evaluationId) {
      router.replace(`/app/clients/${clientId}/evaluations/${id}`);
    }
    return id;
  }

  async function publish() {
    const id = await saveDraft();
    if (!id) return;
    setBusy(true);
    const result = await apiFetch<ClientEvaluation>(`/api/v1/evaluations/${id}/publish`, {
      method: "POST",
      body: "{}",
    });
    setBusy(false);
    setConfirmPublish(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setStatus(result.data!.status);
  }

  async function unpublish() {
    if (!currentId) return;
    setBusy(true);
    const result = await apiFetch<ClientEvaluation>(
      `/api/v1/evaluations/${currentId}/unpublish`,
      { method: "POST", body: "{}" },
    );
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setStatus(result.data!.status);
  }

  async function archive() {
    if (!currentId) return;
    if (!window.confirm("Arquivar esta avaliação? Ela sairá do histórico ativo e do portal.")) {
      return;
    }
    setBusy(true);
    const result = await apiFetch<ClientEvaluation>(
      `/api/v1/evaluations/${currentId}/archive`,
      { method: "POST", body: "{}" },
    );
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    router.replace(`/app/clients/${clientId}`);
  }

  return (
    <div className="space-y-4 animate-fade-up">
      <BackLink href={`/app/clients/${clientId}`} label="Cliente" />
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="h-display text-3xl text-[var(--color-ink)]">
            {currentId ? "Avaliação" : "Nova avaliação"}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            Status: {status === "published" ? "Publicada" : "Rascunho"}
          </p>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}

      <section className="space-y-3" aria-label="Visível ao cliente">
        <FormSectionIntro
          title="Visível ao cliente"
          description="O que estiver nesta seção pode ser publicado no portal. Nada é publicado sem o seu toque em Publicar."
        />
        <TextField
          label="Título"
          value={form.title}
          placeholder={guide.titlePlaceholder}
          onChange={(e) => updateField("title", e.target.value)}
          required
        />
        <SuggestionChips
          chips={guide.titleSuggestions}
          onSelect={(value) => updateField("title", value)}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Período avaliado — início"
            type="date"
            value={form.evaluated_from}
            onChange={(e) => updateField("evaluated_from", e.target.value)}
          />
          <TextField
            label="Período avaliado — fim"
            type="date"
            value={form.evaluated_to}
            onChange={(e) => updateField("evaluated_to", e.target.value)}
          />
        </div>
        <TextArea
          label="Resumo geral"
          value={form.summary}
          placeholder={guide.summaryPlaceholder}
          onChange={(e) => updateField("summary", e.target.value)}
          rows={3}
        />
        <SuggestionChips
          chips={guide.summaryChips}
          onSelect={(value) => updateField("summary", `${form.summary}${value}`)}
        />
        <div className="space-y-2">
          <p className="text-sm font-medium">Conquistas</p>
          <FieldHint>{guide.achievementsPlaceholder}</FieldHint>
          <ul className="space-y-1">
            {achievementItems.map((item, index) => (
              <li key={`${item}-${index}`} className="flex min-h-11 items-center justify-between gap-2 text-sm">
                <span>{item}</span>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    updateField(
                      "achievements",
                      achievementItems.filter((_, i) => i !== index).join("\n"),
                    )
                  }
                >
                  Remover
                </Button>
              </li>
            ))}
          </ul>
          <TextField
            label="Nova conquista"
            value={achievementDraft}
            placeholder={guide.achievementsPlaceholder}
            onChange={(e) => setAchievementDraft(e.target.value)}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              const next = achievementDraft.trim();
              if (!next) return;
              updateField("achievements", [...achievementItems, next].join("\n"));
              setAchievementDraft("");
            }}
          >
            Adicionar conquista
          </Button>
        </div>
        <TextArea
          label="Pontos de atenção"
          value={form.attention_points}
          placeholder={guide.attentionPlaceholder}
          onChange={(e) => updateField("attention_points", e.target.value)}
          rows={3}
        />
        <TextArea
          label="Próximos passos"
          value={form.next_goals}
          placeholder={guide.nextStepsPlaceholder}
          onChange={(e) => updateField("next_goals", e.target.value)}
          rows={3}
        />
        <TextArea
          label="Mensagem para o cliente"
          value={form.client_message}
          onChange={(e) => updateField("client_message", e.target.value)}
          rows={3}
        />
      </section>

      <section className="space-y-3" aria-label="Critérios opcionais">
        <div>
          <h2 className="text-base font-semibold">Critérios (opcional)</h2>
          <p className="text-sm text-[var(--color-ink-muted)]">{SCALE_HINT}</p>
        </div>
        {form.criteria.map((c, index) => (
          <div
            key={index}
            className="space-y-2 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3"
          >
            <TextField
              label={`Critério ${index + 1}`}
              value={c.name}
              onChange={(e) => updateCriterion(index, { name: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-2">
              <TextField
                label="Pontuação"
                type="number"
                min={1}
                max={c.scale_max ?? 5}
                value={c.score ?? ""}
                onChange={(e) =>
                  updateCriterion(index, {
                    score: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
              <TextField
                label="Escala máxima"
                type="number"
                min={2}
                max={10}
                value={c.scale_max ?? 5}
                onChange={(e) =>
                  updateCriterion(index, { scale_max: Number(e.target.value) || 5 })
                }
              />
            </div>
            <TextArea
              label="Comentário do critério"
              value={c.comment ?? ""}
              onChange={(e) => updateCriterion(index, { comment: e.target.value })}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => moveCriterion(index, -1)}
                disabled={index === 0}
              >
                Subir
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => moveCriterion(index, 1)}
                disabled={index === form.criteria.length - 1}
              >
                Descer
              </Button>
              <Button type="button" variant="secondary" onClick={() => removeCriterion(index)}>
                Remover
              </Button>
            </div>
          </div>
        ))}
        <Button type="button" variant="secondary" fullWidth onClick={addCriterion}>
          Adicionar critério
        </Button>
      </section>

      <section
        className="space-y-3 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-bg)] p-3"
        aria-label="Anotação privada"
      >
        <h2 className="text-base font-semibold">Anotação privada</h2>
        <p className="text-sm text-[var(--color-ink-muted)]">
          Nunca aparece no portal do cliente.
        </p>
        <TextArea
          label="Notas privadas"
          value={form.private_notes}
          onChange={(e) => updateField("private_notes", e.target.value)}
        />
      </section>

      <section
        className="space-y-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3"
        aria-label="Pré-visualização do portal"
      >
        <h2 className="text-base font-semibold">Prévia do portal</h2>
        <p className="text-sm font-medium">{form.title || "Sem título"}</p>
        {form.summary ? <p className="text-sm whitespace-pre-wrap">{form.summary}</p> : null}
        {form.achievements ? (
          <p className="text-sm whitespace-pre-wrap">
            <span className="font-medium">Conquistas: </span>
            {form.achievements}
          </p>
        ) : null}
        {form.next_goals ? (
          <p className="text-sm whitespace-pre-wrap">
            <span className="font-medium">Próximos objetivos: </span>
            {form.next_goals}
          </p>
        ) : null}
        {form.client_message ? (
          <p className="text-sm whitespace-pre-wrap">{form.client_message}</p>
        ) : null}
        {form.criteria.length > 0 ? (
          <ul className="space-y-1 text-sm">
            {form.criteria.map((c, i) => (
              <li key={i}>
                {c.name || "Critério"}
                {c.score != null ? ` · ${c.score}/${c.scale_max ?? 5}` : ""}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="text-xs text-[var(--color-ink-muted)]">
          Notas privadas não entram nesta prévia.
        </p>
      </section>

      <div className="flex flex-col gap-2 pb-4">
        <Button fullWidth disabled={busy} onClick={() => void saveDraft()}>
          Salvar rascunho
        </Button>
        {!confirmPublish ? (
          <Button
            fullWidth
            variant="secondary"
            disabled={busy}
            onClick={() => setConfirmPublish(true)}
          >
            Publicar no portal
          </Button>
        ) : (
          <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
            <p className="text-sm">
              Ao publicar, o conteúdo da seção “Visível ao cliente” ficará disponível no portal
              Meu Ciclo. Notas privadas continuam ocultas.
            </p>
            <Button fullWidth disabled={busy} onClick={() => void publish()}>
              Confirmar publicação
            </Button>
            <Button
              fullWidth
              variant="secondary"
              disabled={busy}
              onClick={() => setConfirmPublish(false)}
            >
              Cancelar
            </Button>
          </div>
        )}
        {status === "published" && currentId ? (
          <Button fullWidth variant="secondary" disabled={busy} onClick={() => void unpublish()}>
            Voltar para rascunho
          </Button>
        ) : null}
        {currentId ? (
          <Button fullWidth variant="secondary" disabled={busy} onClick={() => void archive()}>
            Arquivar
          </Button>
        ) : null}
      </div>
    </div>
  );
}
