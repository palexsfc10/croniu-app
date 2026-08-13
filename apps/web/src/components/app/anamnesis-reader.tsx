"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";

export type AnamnesisSnapshotItem = {
  id: string;
  label: string;
  section?: string | null;
  section_title?: string | null;
  type?: string;
  order?: number;
  answer?: unknown;
  answer_label?: string | null;
  attention?: boolean;
  sensitive?: boolean;
  help_text?: string | null;
};

export type AnamnesisSummary = {
  primary_goal?: string | null;
  modalities?: string | null;
  availability?: string | null;
  experience?: string | null;
  attention_count?: number;
  attention_labels?: string[];
};

type Props = {
  formName?: string | null;
  submittedAt?: string | null;
  versionNumber?: number | null;
  statusLabel?: string | null;
  requiresAttention?: boolean;
  summary?: AnamnesisSummary | null;
  questions: AnamnesisSnapshotItem[];
};

function looksLikeTechnicalKey(value: string): boolean {
  return /^[a-z]_[a-z0-9_]+$/i.test(value);
}

function formatAnswer(item: AnamnesisSnapshotItem): string {
  if (item.answer_label) return item.answer_label;
  const raw = item.answer;
  if (raw == null || raw === "") return "—";
  if (Array.isArray(raw)) return raw.map(String).join(", ");
  if (typeof raw === "object") {
    const obj = raw as { value?: unknown; complement?: unknown };
    const base = obj.value != null ? String(obj.value) : JSON.stringify(raw);
    return obj.complement ? `${base} — ${obj.complement}` : base;
  }
  return String(raw);
}

function isYesNo(label: string): "yes" | "no" | "unknown" | null {
  const v = label.trim().toLowerCase();
  if (["sim", "yes"].includes(v)) return "yes";
  if (["não", "nao", "no"].includes(v)) return "no";
  if (["não sei", "nao sei", "prefiro não informar", "prefiro detalhar"].includes(v)) {
    return "unknown";
  }
  return null;
}

export function AnamnesisReader({
  formName,
  submittedAt,
  versionNumber,
  statusLabel,
  requiresAttention,
  summary,
  questions,
}: Props) {
  const sections = useMemo(() => {
    const map = new Map<string, AnamnesisSnapshotItem[]>();
    for (const q of questions) {
      const title = q.section_title || "Respostas";
      // Never use technical key as visible title
      const label = looksLikeTechnicalKey(q.label) ? "Resposta" : q.label;
      const item = { ...q, label };
      const list = map.get(title) ?? [];
      list.push(item);
      map.set(title, list);
    }
    return Array.from(map.entries());
  }, [questions]);

  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(sections.map(([title], idx) => [title, idx < 2])),
  );

  const attentionCount =
    summary?.attention_count ??
    questions.filter((q) => q.attention && isYesNo(formatAnswer(q)) === "yes").length;

  return (
    <div className="space-y-3">
      <header className="space-y-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-[var(--color-ink)]">
            {formName || "Formulário"}
          </h2>
          {statusLabel ? <Badge tone="neutral">{statusLabel}</Badge> : null}
          {versionNumber != null ? (
            <Badge tone="neutral">v{versionNumber}</Badge>
          ) : null}
        </div>
        {submittedAt ? (
          <p className="text-xs text-[var(--color-ink-muted)]">
            Enviado em {new Date(submittedAt).toLocaleString("pt-BR")}
          </p>
        ) : null}
        {requiresAttention || attentionCount > 0 ? (
          <div className="rounded-[var(--radius-sm)] border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 p-2 text-sm text-[var(--color-ink)]">
            <p className="font-medium">Atenção antes do início</p>
            <p className="text-[var(--color-ink-muted)]">
              O aluno informou {attentionCount || "um"} ponto
              {attentionCount === 1 ? "" : "s"} que precisa{attentionCount === 1 ? "" : "m"}{" "}
              ser analisado{attentionCount === 1 ? "" : "s"} antes do início das atividades.
            </p>
          </div>
        ) : null}
        {summary ? (
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            {summary.primary_goal ? (
              <div>
                <dt className="text-xs text-[var(--color-ink-muted)]">Objetivo principal</dt>
                <dd>{summary.primary_goal}</dd>
              </div>
            ) : null}
            {summary.modalities ? (
              <div>
                <dt className="text-xs text-[var(--color-ink-muted)]">Modalidade</dt>
                <dd>{summary.modalities}</dd>
              </div>
            ) : null}
            {summary.availability ? (
              <div>
                <dt className="text-xs text-[var(--color-ink-muted)]">Disponibilidade</dt>
                <dd>{summary.availability}</dd>
              </div>
            ) : null}
            {summary.experience ? (
              <div>
                <dt className="text-xs text-[var(--color-ink-muted)]">Experiência</dt>
                <dd>{summary.experience}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
      </header>

      {sections.map(([title, items]) => {
        const isOpen = open[title] ?? false;
        return (
          <section
            key={title}
            className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]"
          >
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-semibold text-[var(--color-ink)]"
              onClick={() => setOpen((prev) => ({ ...prev, [title]: !isOpen }))}
              aria-expanded={isOpen}
            >
              <span>{title}</span>
              <span className="text-xs font-normal text-[var(--color-ink-muted)]">
                {isOpen ? "Recolher" : "Expandir"}
              </span>
            </button>
            {isOpen ? (
              <ul className="space-y-3 border-t border-[var(--color-border)] px-3 py-3">
                {items.map((item) => {
                  const answer = formatAnswer(item);
                  const yn = isYesNo(answer);
                  return (
                    <li key={item.id} className="space-y-1 text-sm">
                      <p className="font-medium text-[var(--color-ink)]">{item.label}</p>
                      {yn ? (
                        <Badge
                          tone={yn === "yes" ? "warning" : yn === "no" ? "success" : "neutral"}
                        >
                          {answer}
                        </Badge>
                      ) : item.type === "multi" || answer.includes(",") ? (
                        <div className="flex flex-wrap gap-1">
                          {answer.split(",").map((chip) => (
                            <Badge key={`${item.id}-${chip}`} tone="neutral">
                              {chip.trim()}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[var(--color-ink)]">{answer}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
