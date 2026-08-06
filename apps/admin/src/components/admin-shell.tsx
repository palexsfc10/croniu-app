"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandWordmark } from "@/components/brand";
import { useAdminAuth } from "@/components/auth/admin-auth-provider";
import { Button } from "@/components/ui/button";

const nav = [
  { href: "/dashboard", label: "Visão geral" },
  { href: "/organizations", label: "Organizações" },
  { href: "/users", label: "Usuários" },
  { href: "/ai", label: "Assistente IA" },
] as const;

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { me, loading, logout } = useAdminAuth();

  if (loading) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4" role="status">
        <div className="flex items-baseline gap-2">
          <BrandWordmark size="md" surface="light" />
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">
            Admin
          </span>
        </div>
        <p className="text-sm text-[var(--color-ink-muted)]">Carregando sessão administrativa…</p>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4" role="status">
        <div className="flex items-baseline gap-2">
          <BrandWordmark size="md" surface="light" />
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">
            Admin
          </span>
        </div>
        <p className="text-sm text-[var(--color-ink-muted)]">Acesso negado. Redirecionando…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col md:flex-row">
      <aside className="border-b border-[var(--color-border)] bg-[var(--color-surface)] md:w-56 md:border-b-0 md:border-r">
        <div className="px-4 py-4">
          <div className="flex flex-wrap items-baseline gap-2">
            <BrandWordmark size="sm" surface="light" compact />
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">
              Admin
            </span>
          </div>
          <p className="mt-1 text-xs text-[var(--color-ink-muted)]">Administração da plataforma</p>
        </div>
        <nav aria-label="Admin" className="flex gap-1 overflow-x-auto px-2 pb-3 md:flex-col md:overflow-visible">
          {nav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "min-h-11 whitespace-nowrap rounded-[var(--radius-md)] px-3 py-2 text-sm font-semibold",
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
        </nav>
        <div className="hidden border-t border-[var(--color-border)] px-4 py-3 md:block">
          <p className="truncate text-sm font-medium">{me.full_name}</p>
          <p className="truncate text-xs text-[var(--color-ink-muted)]">{me.role}</p>
          <Button variant="ghost" className="mt-2 px-0" onClick={() => void logout()}>
            Sair
          </Button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3 md:hidden">
          <p className="truncate text-sm">{me.full_name}</p>
          <Button variant="ghost" onClick={() => void logout()}>
            Sair
          </Button>
        </header>
        <main className="flex-1 px-4 py-5 md:px-6">{children}</main>
      </div>
    </div>
  );
}
