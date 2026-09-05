"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  apiFetch,
  type ClientEvaluation,
  type EvaluationCriterionInput,
} from "@/lib/api";
import { useAuth } from "@/components/auth/auth-provider";
import { evaluationGuidance } from "@/lib/form-guidance";
import { EVALUATION_SAVED_KEY } from "@/lib/evaluation-flow";
import { useMediaQuery } from "@/lib/use-media-query";
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

/** Desktop: an always-open, clearly-bounded section — this is where
 * "seções claras" comes from. Mobile: the same content behind a
 * `<details>`, closed by default — the redesign's "uma seção por vez"
 * for the two secondary sections (Critérios, Anotação privada); the
 * primary "Visível ao cliente" section stays a plain section on every
 * viewport since it's the one thing almost everyone opening this form
 * actually came to fill in. `tone="private"` gives the anotação privada
 * section a visibly different (amber) surface — the "distinção forte
 * entre conteúdo público e nota privada" the redesign asked for, not
 * just a dashed border easy to miss. */
function CollapsibleSection({
  id,
  title,
  description,
  tone = "default",
  children,
}: {
  id: string;
  title: string;
  description?: string;
  tone?: "default" | "private";
  children: ReactNode;
}) {
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const surface =
    tone === "private"
      ? "border-[var(--color-warning)]/35 bg-[var(--color-warning-subtle)]/40"
      : "border-[var(--color-border)] bg-[var(--color-surface)]";

  if (isDesktop) {
    return (
      <section id={id} aria-label={title} className={`space-y-3 rounded-[var(--radius-lg)] border p-4 ${surface}`}>
        <div>
          <h2 className="text-base font-semibold text-[var(--color-ink)]">{title}</h2>
          {description ? <p className="text-sm text-[var(--color-ink-muted)]">{description}</p> : null}
        </div>
        {children}
      </section>
    );
  }
  return (
    <details id={id} className={`space-y-3 rounded-[var(--radius-lg)] border p-4 ${surface}`}>
      <summary className="cursor-pointer text-base font-semibold text-[var(--color-ink)] [&::-webkit-details-marker]:hidden">
        {title}
      </summary>
      <div className="space-y-3 pt-2">
        {description ? <p className="text-sm text-[var(--color-ink-muted)]">{description}</p> : null}
        {children}
      </div>
    </details>
  );
}

/** Same content shown two ways: an always-visible sticky sidebar column
 * on desktop, and a collapsible "Ver prévia do portal" on mobile (a
 * permanent third column has nowhere to go on a narrow screen). One
 * component, so the two can never show different content. */
function PortalPreview({ form }: { form: FormState }) {
  return (
    <>
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
      {form.client_message ? <p className="text-sm whitespace-pre-wrap">{form.client_message}</p> : null}
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
      <p className="text-xs text-[var(--color-ink-muted)]">Notas privadas não entram nesta prévia.</p>
    </>
  );
}

type Props = {
  clientId: string;
  evaluationId?: string;
  initial?: ClientEvaluation | null;
  /** Present only when opened from a directed, single-purpose entry point
   * (e.g. the "Realizar avaliação" card on /app) — publishing then redirects
   * here instead of staying on the editor, matching the existing intent of
   * the `returnTo` query param already built into the accompaniment and
   * client-profile "Registrar agora" links. Absent for the normal
   * create/edit workflow, which keeps its current no-navigation behavior. */
  returnTo?: string;
  /** Routine pendency (OperationalOccurrence) this evaluation fulfills, if
   * any — completed via the same /routines/occurrences/{id}/decide endpoint
   * the routines board itself already uses, right before the returnTo
   * redirect. */
  occurrenceId?: string;
};

export function EvaluationEditor({
  clientId,
  evaluationId,
  initial = null,
  returnTo,
  occurrenceId,
}: Props) {
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
    if (result.error) {
      setBusy(false);
      setConfirmPublish(false);
      setError(result.error.message);
      return;
    }
    setStatus(result.data!.status);
    if (!returnTo) {
      setBusy(false);
      setConfirmPublish(false);
      return;
    }
    // Best-effort: the evaluation is already published either way. A failed
    // decide() just leaves the routine pendency open — visible again next
    // time, not a data-loss risk — so it must never block the return trip.
    if (occurrenceId) {
      await apiFetch(`/api/v1/routines/occurrences/${occurrenceId}/decide`, {
        method: "POST",
        body: JSON.stringify({ status: "completed" }),
      });
    }
    try {
      sessionStorage.setItem(EVALUATION_SAVED_KEY, "1");
    } catch {
      /* ignore */
    }
    router.replace(returnTo);
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

      <div className="lg:grid lg:grid-cols-[160px_minmax(0,1fr)_300px] lg:items-start lg:gap-6">
      <nav aria-label="Seções" className="hidden lg:sticky lg:top-4 lg:col-start-1 lg:flex lg:flex-col lg:gap-1 lg:self-start">
        <a
          href="#eval-section-publico"
          className="rounded-[var(--radius-sm)] px-2 py-1.5 text-sm font-medium text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-ink)]"
        >
          Visível ao cliente
        </a>
        <a
          href="#eval-section-criterios"
          className="rounded-[var(--radius-sm)] px-2 py-1.5 text-sm font-medium text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-ink)]"
        >
          Critérios
        </a>
        <a
          href="#eval-section-privado"
          className="rounded-[var(--radius-sm)] px-2 py-1.5 text-sm font-medium text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-ink)]"
        >
          Anotação privada
        </a>
      </nav>

      <div className="space-y-4 lg:col-start-2 lg:min-w-0">
      <section id="eval-section-publico" className="space-y-3" aria-label="Visível ao cliente">
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

      <CollapsibleSection id="eval-section-criterios" title="Critérios (opcional)" description={SCALE_HINT}>
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
      </CollapsibleSection>

      <CollapsibleSection
        id="eval-section-privado"
        title="Anotação privada"
        description="Nunca aparece no portal do cliente."
        tone="private"
      >
        <TextArea
          label="Notas privadas"
          value={form.private_notes}
          onChange={(e) => updateField("private_notes", e.target.value)}
        />
      </CollapsibleSection>
      </div>

      <aside
        aria-label="Pré-visualização do portal"
        className="hidden lg:sticky lg:top-4 lg:col-start-3 lg:block lg:space-y-2 lg:self-start lg:rounded-[var(--radius-lg)] lg:border lg:border-[var(--color-border)] lg:bg-[var(--color-surface-muted)] lg:p-3"
      >
        <h2 className="text-base font-semibold">Prévia do portal</h2>
        <PortalPreview form={form} />
      </aside>
      </div>

      <details
        aria-label="Pré-visualização do portal"
        className="space-y-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 lg:hidden"
      >
        <summary className="cursor-pointer text-base font-semibold [&::-webkit-details-marker]:hidden">
          Ver prévia do portal
        </summary>
        <div className="space-y-2 pt-2">
          <PortalPreview form={form} />
        </div>
      </details>

      <div className="sticky bottom-0 z-10 flex flex-col gap-2 border-t border-[var(--color-border)] bg-[var(--color-surface)]/95 py-3 backdrop-blur">
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
              Ao publicar, o conteúdo da seção “Visível ao cliente” ficará disponível na Área do
              cliente. Notas privadas continuam ocultas.
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
