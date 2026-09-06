import Link from "next/link";
import { BrandWordmark } from "@/components/brand";
import { ProductPreview } from "@/components/marketing/product-preview";
import {
  IconBanknote,
  IconCalendarDays,
  IconCheck,
  IconSparkles,
  IconUsersRound,
} from "@/components/ui/icons";
import { authHref } from "@/lib/public-entry";

type Props = {
  next?: string | null;
};

const AREAS = [
  { label: "Clientes", Icon: IconUsersRound },
  { label: "Agenda", Icon: IconCalendarDays },
  { label: "Rotinas", Icon: IconCheck },
  { label: "Financeiro", Icon: IconBanknote },
] as const;

export function PublicEntryHero({ next = null }: Props) {
  const registerHref = authHref("/register", next);
  const loginHref = authHref("/login", next);

  return (
    <div className="public-entry relative flex min-h-dvh flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
        <div className="absolute -left-32 top-0 h-96 w-96 rounded-full bg-[color-mix(in_srgb,var(--brand-200)_40%,transparent)] blur-3xl" />
        <div className="absolute -right-24 top-1/3 h-[28rem] w-[28rem] rounded-full bg-[color-mix(in_srgb,var(--violet-200)_28%,transparent)] blur-3xl" />
      </div>

      <header className="mx-auto flex w-full max-w-[1400px] items-center px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-2 sm:px-8">
        <div className="flex items-baseline gap-1.5">
          <BrandWordmark size="lg" surface="light" />
          <span className="text-base font-normal text-[var(--color-ink-subtle)] sm:text-lg">Workspace</span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col justify-center gap-10 px-5 py-6 sm:px-8 lg:grid lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-16 lg:py-8">
        <section className="animate-fade-up space-y-7">
          <p className="text-xs font-semibold tracking-[0.14em] text-[var(--color-primary)] uppercase">
            Croniu Workspace
          </p>
          <div className="space-y-4">
            <h1 className="h-display text-[2.25rem] leading-[1.1] text-[var(--color-ink)] sm:text-5xl lg:text-[3.25rem]">
              Administre seu trabalho
              <br />
              com mais clareza.
            </h1>
            <p className="max-w-md text-base leading-relaxed text-[var(--color-ink-muted)] sm:text-lg">
              Clientes, agenda, rotinas e financeiro reunidos no Croniu Workspace, com a Cronia
              como sua assistente.
            </p>
          </div>

          <div className="space-y-2.5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href={registerHref}
                className="btn-primary inline-flex min-h-12 items-center justify-center rounded-[var(--radius-md)] px-6 text-base font-semibold sm:w-auto"
              >
                Começar grátis
              </Link>
              <Link
                href={loginHref}
                className="inline-flex min-h-12 items-center justify-center px-2 text-sm font-semibold text-[var(--color-ink-muted)] underline-offset-2 hover:text-[var(--color-ink)] hover:underline sm:w-auto"
              >
                Já possui uma conta? Entrar
              </Link>
            </div>
            <p className="text-sm text-[var(--color-ink-muted)]">7 dias grátis. Configure em poucos minutos.</p>
          </div>

          <ul className="flex flex-wrap gap-2">
            {AREAS.map(({ label, Icon }) => (
              <li
                key={label}
                className="flex min-h-10 items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/80 px-3.5 py-1.5 text-sm font-medium text-[var(--color-ink)]"
              >
                <Icon className="h-4 w-4 text-[var(--color-primary)]" />
                {label}
              </li>
            ))}
            <li className="flex min-h-10 items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/80 px-3.5 py-1.5 text-sm font-medium text-[var(--color-ink)]">
              <span className="relative flex h-4 w-4 items-center justify-center">
                <span className="assistant-orb-glow" aria-hidden />
                <span className="assistant-orb relative z-[1] flex h-4 w-4 items-center justify-center rounded-full">
                  <IconSparkles className="h-2.5 w-2.5 text-[var(--color-ai-foreground)]" aria-hidden />
                </span>
              </span>
              Cronia, sua assistente
            </li>
          </ul>
        </section>

        <aside className="animate-fade-up-delay">
          <ProductPreview />
        </aside>
      </main>

      <footer className="mx-auto flex w-full max-w-[1400px] flex-col gap-2 px-5 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-center text-xs text-[var(--color-ink-muted)] sm:flex-row sm:items-center sm:justify-between sm:text-left">
        <p>© Croniu</p>
        <p className="flex justify-center gap-4 sm:justify-end">
          <Link href="/privacidade" className="underline-offset-2 hover:underline">
            Política de Privacidade
          </Link>
          <Link href="/termos" className="underline-offset-2 hover:underline">
            Termos de Uso
          </Link>
        </p>
      </footer>
    </div>
  );
}
