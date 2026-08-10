import Link from "next/link";
import { BrandWordmark } from "@/components/brand";

type AdminAuthScreenProps = {
  title: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  children: React.ReactNode;
};

/** Admin auth chrome: same wordmark language + separate “Admin” label (never inside the mark). */
export function AdminAuthScreen({
  title,
  subtitle,
  backHref,
  backLabel = "Voltar",
  children,
}: AdminAuthScreenProps) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-6 sm:px-5 sm:pt-10 md:max-w-lg md:justify-center">
      <div className="flex min-h-0 flex-1 flex-col gap-6 md:flex-none">
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
          <div className="flex items-baseline justify-self-end gap-2">
            <BrandWordmark size="md" surface="light" />
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">
              Admin
            </span>
          </div>
        </header>

        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-[var(--color-ink)]">{title}</h1>
          {subtitle ? (
            <p className="text-sm text-[var(--color-ink-muted)]">{subtitle}</p>
          ) : null}
        </div>

        {children}
      </div>
    </main>
  );
}
