"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandWordmark } from "@/components/brand";
import { useAuth } from "@/components/auth/auth-provider";

const navItems = [
  { href: "/app", label: "Hoje" },
  { href: "/app/agenda", label: "Agenda" },
  { href: "/app/clients", label: "Clientes" },
  { href: "/app/cycles", label: "Ciclos" },
  { href: "/app/profile", label: "Mais" },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { me, loading } = useAuth();

  if (loading) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-4 px-4" role="status">
        <BrandWordmark size="md" surface="light" />
        <p className="text-sm text-[var(--color-ink-muted)]">Carregando sua sessão…</p>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-4 px-4" role="status">
        <BrandWordmark size="md" surface="light" />
        <p className="text-sm text-[var(--color-ink-muted)]">Sessão necessária. Redirecionando…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col">
      <header className="sticky top-0 z-10 border-b border-[var(--color-border)]/80 bg-[var(--color-bg)]/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <BrandWordmark size="sm" surface="light" compact />
            <p className="mt-0.5 truncate text-xs text-[var(--color-ink-muted)]">{me.organization.name}</p>
          </div>
          <p className="max-w-[40%] truncate text-right text-sm text-[var(--color-ink-muted)]">
            {me.user.full_name}
          </p>
        </div>
      </header>

      <main className="flex-1 px-4 py-5 pb-28">{children}</main>

      <nav
        aria-label="Navegação principal"
        className="fixed inset-x-0 bottom-0 border-t border-[var(--color-border)] bg-[var(--color-surface)]/95 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur"
      >
        <div className="mx-auto flex max-w-lg items-center justify-between gap-1 px-1 py-2">
          {navItems.map((item) => {
            const active =
              item.href === "/app"
                ? pathname === "/app"
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "min-h-11 flex-1 rounded-[var(--radius-md)] px-1 py-2 text-center text-xs font-semibold sm:text-sm",
                  active
                    ? "bg-[var(--color-surface-muted)] text-[var(--color-primary)]"
                    : "text-[var(--color-ink-muted)]",
                ].join(" ")}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
