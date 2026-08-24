"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandWordmark } from "@/components/brand";
import { useAdminAuth } from "@/components/auth/admin-auth-provider";
import { EnvironmentBadge, EnvironmentIdentity } from "@/components/environment-identity";
import { Button } from "@/components/ui/button";
import {
  IconBuilding,
  IconBug,
  IconCalendarCheck,
  IconDashboard,
  IconGift,
  IconLogOut,
  IconMenu,
  IconMessage,
  IconSparkles,
  IconUsers,
  IconX,
} from "@/components/ui/icons";

const nav = [
  { href: "/dashboard", label: "Visão geral", icon: IconDashboard },
  { href: "/organizations", label: "Organizações", icon: IconBuilding },
  { href: "/users", label: "Usuários", icon: IconUsers },
  { href: "/referrals", label: "Parceiros e indicações", icon: IconGift },
  { href: "/cycle-agenda", label: "Ciclo–agenda", icon: IconCalendarCheck },
  { href: "/feedbacks", label: "Feedbacks", icon: IconMessage },
  { href: "/ai", label: "Assistente IA", icon: IconSparkles },
  { href: "/errors", label: "Erros", icon: IconBug },
] as const;

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Admin" className="flex flex-col gap-0.5">
      {nav.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={[
              "flex min-h-11 items-center gap-2.5 rounded-[var(--radius-md)] px-3 py-2 text-sm font-semibold transition-colors",
              active
                ? "bg-[var(--color-primary-subtle)] text-[var(--color-primary)]"
                : "text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-ink)]",
            ].join(" ")}
            aria-current={active ? "page" : undefined}
          >
            <Icon className="h-[18px] w-[18px] shrink-0" />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function BrandBlock() {
  return (
    <div className="flex items-baseline gap-2">
      <BrandWordmark size="sm" surface="light" compact />
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">
        Admin
      </span>
    </div>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { me, loading, logout } = useAdminAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- close drawer on route change
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setDrawerOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

  if (loading) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4" role="status">
        <BrandBlock />
        <p className="text-sm text-[var(--color-ink-muted)]">Carregando sessão administrativa…</p>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4" role="status">
        <BrandBlock />
        <p className="text-sm text-[var(--color-ink-muted)]">Acesso negado. Redirecionando…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] md:flex">
        <div className="px-4 py-4">
          <BrandBlock />
          <EnvironmentIdentity environment={me.environment} className="mt-2" />
        </div>
        <div className="flex-1 overflow-y-auto px-2">
          <NavLinks pathname={pathname} />
        </div>
        <div className="border-t border-[var(--color-border)] px-4 py-3">
          <p className="truncate text-sm font-medium">{me.full_name}</p>
          <p className="truncate text-xs text-[var(--color-ink-muted)]">{me.role}</p>
          <Button variant="ghost" size="sm" className="mt-2 px-0" onClick={() => void logout()}>
            <IconLogOut className="h-4 w-4" /> Sair
          </Button>
        </div>
      </aside>

      {drawerOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-[var(--color-ink)]/45"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Navegação"
            className="fade-up absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-[var(--color-surface)] shadow-md"
          >
            <div className="flex items-center justify-between px-4 py-4">
              <BrandBlock />
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Fechar navegação"
                className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-muted)]"
              >
                <IconX className="h-5 w-5" />
              </button>
            </div>
            <EnvironmentIdentity environment={me.environment} className="px-4" />
            <div className="mt-2 flex-1 overflow-y-auto px-2">
              <NavLinks pathname={pathname} onNavigate={() => setDrawerOpen(false)} />
            </div>
            <div className="border-t border-[var(--color-border)] px-4 py-3">
              <p className="truncate text-sm font-medium">{me.full_name}</p>
              <Button variant="ghost" size="sm" className="mt-2 px-0" onClick={() => void logout()}>
                <IconLogOut className="h-4 w-4" /> Sair
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 md:hidden">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Abrir navegação"
              className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-muted)]"
            >
              <IconMenu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{me.full_name}</p>
              <EnvironmentBadge environment={me.environment} className="mt-0.5" />
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void logout()}>
            Sair
          </Button>
        </header>
        <main className="flex-1 px-4 py-5 md:px-8 md:py-6">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
