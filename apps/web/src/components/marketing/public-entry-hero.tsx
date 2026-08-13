import Link from "next/link";
import { BrandMark, BrandWordmark } from "@/components/brand";
import { ProductPreview } from "@/components/marketing/product-preview";
import {
  IconCalendarDays,
  IconSparkles,
  IconUsersRound,
} from "@/components/ui/icons";
import { authHref } from "@/lib/public-entry";

type Props = {
  next?: string | null;
};

const BENEFITS = [
  { label: "Clientes organizados", Icon: IconUsersRound },
  { label: "Rotina sob controle", Icon: IconCalendarDays },
  { label: "IA no dia a dia", Icon: IconSparkles },
] as const;

export function PublicEntryHero({ next = null }: Props) {
  const registerHref = authHref("/register", next);
  const loginHref = authHref("/login", next);

  return (
    <div className="public-entry relative flex min-h-dvh flex-col">
      <div
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        aria-hidden="true"
      >
        <div className="absolute -left-24 top-8 h-64 w-64 rounded-full bg-[color-mix(in_srgb,var(--brand-200)_45%,transparent)] blur-3xl" />
        <div className="absolute -right-16 top-40 h-72 w-72 rounded-full bg-[color-mix(in_srgb,var(--violet-200)_35%,transparent)] blur-3xl" />
      </div>

      <header className="mx-auto flex w-full max-w-6xl items-center gap-3 px-5 pb-2 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8">
        <BrandMark size="sm" decorative />
        <BrandWordmark size="lg" surface="light" />
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center gap-10 px-5 py-6 sm:px-8 lg:grid lg:grid-cols-2 lg:items-center lg:gap-12 lg:py-10">
        <section className="animate-fade-up space-y-6">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-primary)]">
            Seu parceiro de rotina
          </p>
          <div className="space-y-3">
            <h1 className="h-display text-[2rem] leading-[1.15] text-[var(--color-ink)] sm:text-4xl lg:text-[2.75rem]">
              Organize seus clientes.
              <br />
              Simplifique sua rotina.
            </h1>
            <p className="max-w-md text-base leading-relaxed text-[var(--color-ink-muted)] sm:text-lg">
              Cadastros, agenda, planos, ciclos e acompanhamentos em um só lugar — com IA
              para ajudar no dia a dia.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
            <Link
              href={registerHref}
              className="btn-primary inline-flex min-h-12 w-full items-center justify-center rounded-[var(--radius-md)] px-4 text-base font-semibold sm:flex-1"
            >
              Criar minha conta
            </Link>
            <Link
              href={loginHref}
              className="btn-secondary inline-flex min-h-12 w-full items-center justify-center rounded-[var(--radius-md)] px-4 text-base font-semibold sm:flex-1"
            >
              Já tenho uma conta
            </Link>
          </div>

          <ul className="grid gap-2 sm:grid-cols-3">
            {BENEFITS.map(({ label, Icon }) => (
              <li
                key={label}
                className="flex min-h-11 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)]/80 bg-[var(--color-surface)]/80 px-3 py-2 text-sm text-[var(--color-ink)]"
              >
                <Icon className="h-4 w-4 text-[var(--color-primary)]" />
                <span>{label}</span>
              </li>
            ))}
          </ul>

          <p className="hidden text-sm text-[var(--color-ink-muted)] lg:block">
            Cliente entra → Croniu organiza → Você acompanha
          </p>
        </section>

        <aside className="animate-fade-up-delay pb-2 lg:pb-0">
          <ProductPreview />
        </aside>
      </main>

      <footer className="mx-auto w-full max-w-6xl px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2 text-center text-xs text-[var(--color-ink-subtle)] sm:px-8 sm:text-left">
        <p>© Croniu</p>
      </footer>
    </div>
  );
}
