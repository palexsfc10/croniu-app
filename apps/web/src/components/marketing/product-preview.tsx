import { IconBanknote, IconCalendarDays, IconCheck, IconHome, IconSparkles, IconUsersRound } from "@/components/ui/icons";

/**
 * Decorative product preview for the public entry — a faithful composite of
 * the real Workspace (Início + Agenda + Financeiro + IA in front, Cliente
 * 360° behind), not a generic marketing mockup. Fictional demo data only.
 * Not interactive; ignored by assistive tech via aria-hidden on the
 * composition.
 */
export function ProductPreview() {
  return (
    <div className="public-entry-preview relative mx-auto w-full max-w-md pt-10 pr-6 lg:max-w-lg" aria-hidden="true">
      {/* Ambient light + a very faint technical grid, not a spotlight */}
      <div className="pointer-events-none absolute -inset-10 -z-10 rounded-[2.5rem] bg-[radial-gradient(ellipse_at_25%_15%,color-mix(in_srgb,var(--brand-200)_45%,transparent),transparent_55%),radial-gradient(ellipse_at_85%_75%,color-mix(in_srgb,var(--violet-200)_32%,transparent),transparent_50%)]" />
      <div
        className="pointer-events-none absolute -inset-10 -z-10 rounded-[2.5rem] opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(color-mix(in srgb, var(--color-ink) 6%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--color-ink) 6%, transparent) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          maskImage: "radial-gradient(ellipse 70% 70% at 50% 40%, black, transparent)",
        }}
      />

      {/* Back layer — Cliente 360° */}
      <article className="absolute top-0 right-0 z-0 hidden w-52 rotate-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5 shadow-lg sm:block">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-subtle)] text-xs font-bold text-[var(--color-primary)]">
            AM
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--color-ink)]">Ana Martins</p>
            <span className="badge badge-success">Ativo</span>
          </div>
        </div>
        <dl className="mt-3 space-y-1.5 text-xs">
          <div className="flex justify-between gap-2">
            <dt className="text-[var(--color-ink-muted)]">Ciclo</dt>
            <dd className="font-medium text-[var(--color-ink)]">Pilates · mensal</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-[var(--color-ink-muted)]">Próxima sessão</dt>
            <dd className="font-medium text-[var(--color-ink)]">Qui · 10h</dd>
          </div>
        </dl>
      </article>

      {/* Front layer — Início / Agenda / Financeiro / IA */}
      <article className="public-entry-card public-entry-card--front relative z-10 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-md">
        <div className="flex items-center gap-2 rounded-t-[var(--radius-lg)] border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3.5 py-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[color-mix(in_srgb,var(--color-danger)_55%,transparent)]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[color-mix(in_srgb,var(--color-warning)_55%,transparent)]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[color-mix(in_srgb,var(--color-success)_55%,transparent)]" />
          <span className="ml-2 flex items-center gap-1.5 text-xs font-semibold text-[var(--color-ink-muted)]">
            <IconHome className="h-3.5 w-3.5" /> Início
          </span>
        </div>

        <div className="flex">
          <div className="hidden w-11 shrink-0 flex-col items-center gap-3 border-r border-[var(--color-border)] py-3.5 sm:flex">
            <span className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-primary-subtle)] text-[var(--color-primary)]">
              <IconHome className="h-4 w-4" />
            </span>
            <IconUsersRound className="h-4 w-4 text-[var(--color-ink-subtle)]" />
            <IconCalendarDays className="h-4 w-4 text-[var(--color-ink-subtle)]" />
            <IconCheck className="h-4 w-4 text-[var(--color-ink-subtle)]" />
          </div>

          <div className="min-w-0 flex-1 space-y-3 p-3.5">
            <div>
              <p className="text-[11px] font-semibold tracking-wide text-[var(--color-primary)] uppercase">Hoje</p>
              <ul className="mt-1.5 space-y-1.5 text-sm text-[var(--color-ink)]">
                <li className="flex items-center justify-between gap-3">
                  <span className="truncate">09:00 · Ana Martins</span>
                  <span className="badge badge-primary shrink-0">Confirmado</span>
                </li>
                <li className="flex items-center justify-between gap-3">
                  <span className="truncate">11:30 · Diego Farias</span>
                  <span className="badge badge-primary shrink-0">Confirmado</span>
                </li>
              </ul>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-2.5 py-2">
                <p className="flex items-center gap-1 text-[10px] font-semibold text-[var(--color-ink-subtle)] uppercase">
                  <IconBanknote className="h-3 w-3" /> Mês
                </p>
                <p className="text-sm font-bold text-[var(--color-ink)] tabular-nums">R$ 4.280</p>
              </div>
              <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-2.5 py-2">
                <p className="flex items-center gap-1 text-[10px] font-semibold text-[var(--color-ink-subtle)] uppercase">
                  <IconCalendarDays className="h-3 w-3" /> Renovações
                </p>
                <p className="text-sm font-bold text-[var(--color-ink)] tabular-nums">3 esta semana</p>
              </div>
            </div>

            <div className="surface-ai flex items-start gap-2 rounded-[var(--radius-md)] p-2.5">
              <IconSparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-ai)]" />
              <p className="text-xs leading-snug text-[var(--color-ink)]">
                Sugestão: falar com Diego sobre a renovação do ciclo.
              </p>
            </div>
          </div>
        </div>
      </article>
    </div>
  );
}
