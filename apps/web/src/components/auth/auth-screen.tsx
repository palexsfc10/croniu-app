import Link from "next/link";
import { BrandWordmark } from "@/components/brand";

type AuthScreenProps = {
  title: string;
  subtitle?: string;
  /** When set, shows a back control on the left; wordmark stays on the right. */
  backHref?: string;
  backLabel?: string;
  children: React.ReactNode;
};

/**
 * Auth chrome: asymmetric header with BrandWordmark top-right (mobile + desktop column).
 * Title stays left-aligned under the header — never duplicate the mark next to the title.
 */
export function AuthScreen({
  title,
  subtitle,
  backHref,
  backLabel = "Voltar",
  children,
}: AuthScreenProps) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-6 sm:px-5 sm:pt-10 md:max-w-lg md:justify-center">
      <div className="animate-fade-up flex min-h-0 flex-1 flex-col gap-6 md:flex-none">
        <header className="grid grid-cols-[1fr_auto] items-center gap-3">
          <div className="min-w-0 justify-self-start">
            {backHref ? (
              <Link
                href={backHref}
                className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--color-ink-muted)] underline-offset-2 hover:text-[var(--color-ink)] hover:underline"
              >
                {backLabel}
              </Link>
            ) : (
              <span aria-hidden="true" className="block min-h-11 w-px" />
            )}
          </div>
          <div className="justify-self-end">
            <BrandWordmark size="md" surface="light" />
          </div>
        </header>

        <div className="space-y-1">
          <h1 className="h-display-public text-2xl text-[var(--color-ink)]">{title}</h1>
          {subtitle ? (
            <p className="text-sm text-[var(--color-ink-muted)]">{subtitle}</p>
          ) : null}
        </div>

        {children}

        <p className="pt-2 text-center text-xs text-[var(--color-ink-subtle)]">
          Ao continuar, você concorda com os{" "}
          <Link href="/termos" className="underline-offset-2 hover:underline">
            Termos de Uso
          </Link>{" "}
          e a{" "}
          <Link href="/privacidade" className="underline-offset-2 hover:underline">
            Política de Privacidade
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
