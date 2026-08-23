/**
 * Decorative product preview for the public entry — fictional demo data only.
 * Not interactive; ignored by assistive tech via aria-hidden on the composition.
 */
export function ProductPreview() {
  return (
    <div
      className="public-entry-preview relative mx-auto w-full max-w-md select-none"
      aria-hidden="true"
    >
      <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] bg-[radial-gradient(ellipse_at_30%_20%,color-mix(in_srgb,var(--brand-200)_55%,transparent),transparent_55%),radial-gradient(ellipse_at_80%_70%,color-mix(in_srgb,var(--violet-200)_40%,transparent),transparent_50%)]" />

      <div className="public-entry-preview__stack relative space-y-3">
        <article className="public-entry-card rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-md">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-primary)]">
            Hoje
          </p>
          <ul className="mt-2 space-y-1.5 text-sm text-[var(--color-ink)]">
            <li className="flex justify-between gap-3">
              <span>Acompanhamentos</span>
              <span className="font-semibold tabular-nums">2</span>
            </li>
            <li className="flex justify-between gap-3">
              <span>Revisão de plano</span>
              <span className="font-semibold tabular-nums">1</span>
            </li>
            <li className="flex justify-between gap-3">
              <span>Feedbacks</span>
              <span className="font-semibold tabular-nums">3</span>
            </li>
          </ul>
        </article>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <article className="public-entry-card public-entry-card--offset rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-accent)]">
              Novo cliente
            </p>
            <p className="mt-1.5 text-sm font-medium text-[var(--color-ink)]">
              Cadastro recebido
            </p>
            <p className="text-xs text-[var(--color-ink-muted)]">Formulário concluído</p>
            <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
              Próximo passo: analisar
            </p>
          </article>

          <article className="public-entry-card rounded-[var(--radius-lg)] border border-[var(--color-ai-border)] bg-[var(--color-ai-subtle)] p-3.5 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ai)]">
              Croniu IA
            </p>
            <p className="mt-1.5 text-sm leading-snug text-[var(--color-ink)]">
              Organizei suas prioridades de hoje.
            </p>
          </article>
        </div>

        <article className="public-entry-card public-entry-card--review hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-3.5 shadow-sm sm:block">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
            Próxima revisão
          </p>
          <p className="mt-1.5 text-sm font-medium text-[var(--color-ink)]">Terça-feira</p>
          <p className="text-xs text-[var(--color-ink-muted)]">4 planos para revisar</p>
        </article>
      </div>
    </div>
  );
}
