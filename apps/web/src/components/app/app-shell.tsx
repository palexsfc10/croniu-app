"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandWordmark } from "@/components/brand";
import { useAuth } from "@/components/auth/auth-provider";
import { Badge } from "@/components/ui/badge";

const navItems = [
  { href: "/app", label: "Hoje" },
  { href: "/app/agenda", label: "Agenda" },
  { href: "/app/clients", label: "Clientes" },
  { href: "/app/cycles", label: "Ciclos" },
  { href: "/app/profile", label: "Mais" },
] as const;

function isNavActive(pathname: string, href: string) {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isAssistantActive(pathname: string) {
  return pathname === "/app/assistant" || pathname.startsWith("/app/assistant/");
}

function navLinkClass(active: boolean) {
  return [
    "min-h-11 rounded-[var(--radius-md)] px-3 py-2 text-sm font-semibold transition-colors duration-[var(--duration-fast)]",
    active
      ? "bg-[var(--color-primary-subtle)] text-[var(--color-primary)]"
      : "text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-ink)]",
  ].join(" ");
}

function assistantLinkClass(active: boolean) {
  return [
    "min-h-11 rounded-[var(--radius-md)] px-3 py-2 text-sm font-semibold transition-colors duration-[var(--duration-fast)]",
    active
      ? "bg-[var(--color-ai-subtle)] text-[var(--color-ai-hover)]"
      : "text-[var(--color-ai)] hover:bg-[var(--color-ai-subtle)]",
  ].join(" ");
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { me, loading } = useAuth();

  if (loading) {
    return (
      <div
        className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-4 px-4"
        role="status"
      >
        <BrandWordmark size="md" surface="light" />
        <p className="text-sm text-[var(--color-ink-muted)]">Carregando sua sessão…</p>
      </div>
    );
  }

  if (!me) {
    return (
      <div
        className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-4 px-4"
        role="status"
      >
        <BrandWordmark size="md" surface="light" />
        <p className="text-sm text-[var(--color-ink-muted)]">Sessão necessária. Redirecionando…</p>
      </div>
    );
  }

  const assistantActive = isAssistantActive(pathname);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col md:flex-row">
      <aside className="app-sidebar hidden border-[var(--color-border)] md:flex md:w-56 md:shrink-0 md:flex-col md:border-r">
        <div className="sticky top-0 flex min-h-dvh flex-col">
          <div className="px-4 py-4">
            <BrandWordmark size="sm" surface="light" compact />
            <p className="mt-1 truncate text-xs text-[var(--color-ink-muted)]">
              {me.organization.name}
            </p>
          </div>
          <nav
            aria-label="Navegação principal"
            className="flex flex-1 flex-col gap-1 px-2 pb-3"
          >
            {navItems.map((item) => {
              const active = isNavActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={navLinkClass(active)}
                  aria-current={active ? "page" : undefined}
                >
                  {item.label}
                </Link>
              );
            })}
            <Link
              href="/app/assistant"
              className={["mt-2 flex items-center gap-2", assistantLinkClass(assistantActive)].join(
                " ",
              )}
              aria-current={assistantActive ? "page" : undefined}
            >
              Assistente
              <Badge tone="ai">IA</Badge>
            </Link>
            <Link
              href="/app/manual"
              className="min-h-11 rounded-[var(--radius-md)] px-3 py-2 text-sm font-semibold text-[var(--color-link)] hover:bg-[var(--color-primary-subtle)]"
            >
              Manual
            </Link>
          </nav>
          <div className="border-t border-[var(--color-border)] px-4 py-3">
            <p className="truncate text-sm font-medium">{me.user.full_name}</p>
            <p className="truncate text-xs text-[var(--color-ink-muted)]">{me.role}</p>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 border-b border-[var(--color-border)]/80 bg-[var(--color-bg)]/90 px-4 py-3 backdrop-blur md:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="min-w-0">
                <BrandWordmark size="sm" surface="light" compact />
                <p className="mt-0.5 truncate text-xs text-[var(--color-ink-muted)]">
                  {me.organization.name}
                </p>
              </div>
              <Link
                href="/app/assistant"
                className={[
                  "inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-md)] px-2.5 py-1.5 text-sm font-semibold",
                  assistantActive
                    ? "bg-[var(--color-ai-subtle)] text-[var(--color-ai-hover)]"
                    : "text-[var(--color-ai)]",
                ].join(" ")}
                aria-current={assistantActive ? "page" : undefined}
              >
                Assistente
                <Badge tone="ai">IA</Badge>
              </Link>
            </div>
            <div className="flex max-w-[45%] flex-col items-end gap-0.5">
              <p className="truncate text-right text-sm text-[var(--color-ink-muted)]">
                {me.user.full_name}
              </p>
              <Link
                href="/app/manual"
                className="text-xs font-semibold text-[var(--color-link)]"
              >
                Manual
              </Link>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-5 pb-28 md:px-6 md:pb-5">{children}</main>

        <nav
          aria-label="Navegação principal"
          className="app-bottom-nav fixed inset-x-0 bottom-0 border-t border-[var(--color-border)]/70 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden"
        >
          <div className="mx-auto flex max-w-lg items-center justify-between gap-1 px-1 py-2">
            {navItems.map((item) => {
              const active = isNavActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    "min-h-11 flex-1 rounded-[var(--radius-md)] px-1 py-2 text-center text-xs font-semibold transition-colors duration-[var(--duration-fast)] sm:text-sm",
                    active
                      ? "bg-[var(--color-primary-subtle)] text-[var(--color-primary)]"
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
    </div>
  );
}
