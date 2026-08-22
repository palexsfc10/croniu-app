"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { IconAlertCircle, IconChevronDown, IconShieldCheck } from "@/components/ui/icons";

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
  compact?: boolean;
};

function looksLikeTechnicalKey(value: string): boolean {
  return /^[a-z]_[a-z0-9_]+$/i.test(value);
}

export function formatAnamnesisAnswer(item: AnamnesisSnapshotItem): string {
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

// Mirrors backend app.services.anamnesis_snapshot._is_attention_answer
// exactly: a question flagged `attention` in the schema is only a real
// concern when the actual answer VALUE indicates risk — a "Não" to
// "Você sente dor no peito?" is attention-eligible but not itself
// attention-worthy. Without this check, every section that merely
// *contains* attention-eligible questions counted as "N pontos para
// revisar" regardless of what was answered (e.g. "4 pontos" for four
// questions all answered "Não").
const ATTENTION_ANSWER_VALUES = new Set(["sim", "yes", "prefiro_detalhar", "prefer_detail"]);

export function isRealAttentionItem(item: AnamnesisSnapshotItem): boolean {
  if (!item.attention) return false;
  const raw = item.answer;
  if (raw != null) {
    const values = Array.isArray(raw) ? raw : [raw];
    if (values.some((v) => ATTENTION_ANSWER_VALUES.has(String(v).trim().toLowerCase()))) {
      return true;
    }
    // A raw value was present and didn't match — trust it (e.g. "não")
    // over a stale/mismatched label rather than falling through.
    if (values.some((v) => v != null && String(v).trim() !== "")) return false;
  }
  // Fallback for callers that only ever populated the humanized label
  // (answer_label) without the raw value — same semantics via the label.
  const label = (item.answer_label ?? formatAnamnesisAnswer(item)).trim().toLowerCase();
  return /^(sim|yes)\b/.test(label) || label.includes("prefiro detalhar");
}

export function AnamnesisReader({
  formName,
  submittedAt,
  versionNumber,
  statusLabel,
  requiresAttention,
  summary,
  questions,
  compact = false,
}: Props) {
  const sections = useMemo(() => {
    const map = new Map<string, AnamnesisSnapshotItem[]>();
    for (const q of questions) {
      const title = q.section_title || "Respostas";
      const label = looksLikeTechnicalKey(q.label) ? "Resposta" : q.label;
      const item = { ...q, label };
      const list = map.get(title) ?? [];
      list.push(item);
      map.set(title, list);
    }
    return Array.from(map.entries());
  }, [questions]);

  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      sections.map(([title, items], idx) => {
        const hasAttention = items.some((q) => isRealAttentionItem(q));
        return [title, idx === 0 || hasAttention];
      }),
    ),
  );

  const attentionCount =
    summary?.attention_count ?? questions.filter((q) => isRealAttentionItem(q)).length;

  return (
    <div className="space-y-3">
      {!compact ? (
        <header className="space-y-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-[var(--color-ink)]">
              {formName || "Formulário"}
            </h2>
            {statusLabel ? <Badge tone="neutral">{statusLabel}</Badge> : null}
            {versionNumber != null ? <Badge tone="neutral">v{versionNumber}</Badge> : null}
          </div>
          {submittedAt ? (
            <p className="text-xs text-[var(--color-ink-muted)]">
              Enviado em {new Date(submittedAt).toLocaleString("pt-BR")}
            </p>
          ) : null}
          {requiresAttention || attentionCount > 0 ? (
            <p className="text-sm text-[var(--color-ink)]">
              {attentionCount} ponto{attentionCount === 1 ? "" : "s"} para revisar
            </p>
          ) : null}
        </header>
      ) : null}

      {sections.map(([title, items]) => {
        const isOpen = open[title] ?? false;
        const panelId = `anamnesis-section-${title.replace(/\s+/g, "-").toLowerCase()}`;
        const attentionInSection = items.filter((q) => isRealAttentionItem(q)).length;
        return (
          <section
            key={title}
            className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]"
          >
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 px-3 py-3 text-left"
              onClick={() => setOpen((prev) => ({ ...prev, [title]: !isOpen }))}
              aria-expanded={isOpen}
              aria-controls={panelId}
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[var(--color-ink)]">{title}</span>
                <span className="mt-0.5 block text-xs text-[var(--color-ink-muted)]">
                  {attentionInSection > 0
                    ? `${attentionInSection} ponto${attentionInSection === 1 ? "" : "s"} para revisar`
                    : `${items.length} resposta${items.length === 1 ? "" : "s"}`}
                </span>
              </span>
              <span className="flex items-center gap-2">
                {attentionInSection > 0 ? (
                  <IconAlertCircle className="h-[18px] w-[18px] text-amber-700" />
                ) : (
                  <IconShieldCheck className="h-[18px] w-[18px] text-[var(--color-ink-muted)]" />
                )}
                <IconChevronDown
                  className={`h-5 w-5 text-[var(--color-ink-muted)] transition-transform ${isOpen ? "rotate-180" : ""}`}
                />
              </span>
            </button>
            {isOpen ? (
              <ul id={panelId} className="space-y-3 border-t border-[var(--color-border)] px-3 py-3">
                {items.map((item) => {
                  const answer = formatAnamnesisAnswer(item);
                  const yn = isYesNo(answer);
                  return (
                    <li key={item.id} className="space-y-1 text-sm">
                      <p className="font-medium text-[var(--color-ink)]">{item.label}</p>
                      {yn ? (
                        <Badge tone={yn === "yes" ? "warning" : yn === "no" ? "success" : "neutral"}>
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
