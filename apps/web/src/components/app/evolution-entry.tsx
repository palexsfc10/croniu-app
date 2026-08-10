"use client";

import { formatDateBR, type PublicEvaluation } from "@/lib/api";

const SCORE_WORDS: Record<number, string> = {
  1: "Começando",
  2: "Desenvolvendo",
  3: "Em evolução",
  4: "Bom ritmo",
  5: "Consolidado",
};

function periodLabel(ev: PublicEvaluation): string | null {
  if (ev.evaluated_from || ev.evaluated_to) {
    const from = ev.evaluated_from ? formatDateBR(ev.evaluated_from) : "…";
    const to = ev.evaluated_to ? formatDateBR(ev.evaluated_to) : "…";
    return `${from} → ${to}`;
  }
  if (ev.published_at) {
    return formatDateBR(ev.published_at.slice(0, 10));
  }
  return null;
}

function scoreWord(score: number, scaleMax: number): string {
  if (scaleMax === 5 && SCORE_WORDS[score]) return SCORE_WORDS[score];
  return `${score} de ${scaleMax}`;
}

type Props = {
  evaluation: PublicEvaluation;
  /** Softer chrome for professional live preview */
  compact?: boolean;
};

/**
 * Client-facing evolution entry — narrative first, optional criteria as soft meters.
 * No averages, rankings, or private fields.
 *
 * Present at tip imports but was missing from the clean checkout; restored here so
 * web gates pass without touching the dirty original tree.
 */
export function EvolutionEntry({ evaluation: ev, compact = false }: Props) {
  const period = periodLabel(ev);
  const criteria = (ev.criteria ?? []).filter((c) => c.name?.trim());
  const hasBody =
    Boolean(ev.summary?.trim()) ||
    Boolean(ev.achievements?.trim()) ||
    Boolean(ev.next_goals?.trim()) ||
    Boolean(ev.client_message?.trim()) ||
    criteria.length > 0;

  return (
    <article
      className={[
        "space-y-3",
        compact
          ? ""
          : "rounded-[var(--radius-md)] border border-[var(--color-border)]/80 bg-[var(--color-surface)] p-4",
      ].join(" ")}
    >
      <header className="space-y-0.5">
        {period ? (
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
            {period}
          </p>
        ) : null}
        <h3 className="text-base font-semibold text-[var(--color-ink)]">{ev.title}</h3>
      </header>

      {!hasBody ? (
        <p className="text-sm text-[var(--color-ink-muted)]">Sem detalhes publicados ainda.</p>
      ) : null}

      {ev.summary?.trim() ? (
        <p className="text-[15px] leading-relaxed text-[var(--color-ink)] whitespace-pre-wrap">
          {ev.summary}
        </p>
      ) : null}

      {ev.achievements?.trim() ? (
        <p className="text-sm leading-relaxed text-[var(--color-ink)] whitespace-pre-wrap">
          <span className="font-medium text-[var(--color-primary)]">Destaque · </span>
          {ev.achievements}
        </p>
      ) : null}

      {criteria.length > 0 ? (
        <ul className="space-y-2.5 pt-1" aria-label="Critérios acompanhados">
          {criteria.map((c, i) => {
            const max = c.scale_max || 5;
            const score = c.score ?? null;
            return (
              <li key={`${c.name}-${i}`} className="space-y-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-[var(--color-ink)]">{c.name}</span>
                  {score != null ? (
                    <span className="text-xs text-[var(--color-ink-muted)]">
                      {scoreWord(score, max)}
                    </span>
                  ) : null}
                </div>
                {score != null ? (
                  <div
                    className="flex gap-1"
                    role="img"
                    aria-label={`${score} de ${max}`}
                  >
                    {Array.from({ length: max }, (_, idx) => (
                      <span
                        key={idx}
                        className={[
                          "h-1.5 flex-1 rounded-full",
                          idx < score
                            ? "bg-[var(--color-accent)]"
                            : "bg-[var(--color-border)]",
                        ].join(" ")}
                      />
                    ))}
                  </div>
                ) : null}
                {c.comment?.trim() ? (
                  <p className="text-xs text-[var(--color-ink-muted)]">{c.comment}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {ev.next_goals?.trim() ? (
        <div className="rounded-[var(--radius-sm)] bg-[var(--color-surface-muted)]/80 px-3 py-2.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-primary)]">
            Próximo foco
          </p>
          <p className="mt-1 text-sm leading-relaxed text-[var(--color-ink)] whitespace-pre-wrap">
            {ev.next_goals}
          </p>
        </div>
      ) : null}

      {ev.attention_points?.trim() ? (
        <p className="text-sm leading-relaxed text-[var(--color-ink-muted)] whitespace-pre-wrap">
          <span className="font-medium text-[var(--color-ink)]">Para avançar · </span>
          {ev.attention_points}
        </p>
      ) : null}

      {ev.client_message?.trim() ? (
        <blockquote className="border-l-2 border-[var(--color-accent)]/50 pl-3 text-sm italic leading-relaxed text-[var(--color-ink-muted)] whitespace-pre-wrap">
          {ev.client_message}
        </blockquote>
      ) : null}
    </article>
  );
}
