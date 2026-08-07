"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ComponentType, type SVGProps } from "react";
import { BrandMark, BrandWordmark } from "@/components/brand";
import { useAuth } from "@/components/auth/auth-provider";
import { Badge } from "@/components/ui/badge";
import {
  IconCalendarDays,
  IconHome,
  IconLayoutGrid,
  IconRefreshCw,
  IconUser,
  IconUsersRound,
} from "@/components/ui/icons";
import { BillingGate } from "@/components/billing/billing-gate";
import { SUPPORT_EMAIL, supportMailto } from "@/lib/support";

const navItems: {
  href: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement> & { title?: string }>;
}[] = [
  { href: "/app", label: "Hoje", Icon: IconHome },
  { href: "/app/agenda", label: "Agenda", Icon: IconCalendarDays },
  { href: "/app/clients", label: "Clientes", Icon: IconUsersRound },
  { href: "/app/cycles", label: "Ciclos", Icon: IconRefreshCw },
  { href: "/app/profile", label: "Mais", Icon: IconLayoutGrid },
];

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
    "inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-md)] px-2.5 py-2 text-sm font-semibold transition-colors duration-[var(--duration-fast)]",
    active
      ? "bg-[var(--color-ai-subtle)] text-[var(--color-ai-hover)]"
      : "text-[var(--color-ai)] hover:bg-[var(--color-ai-subtle)]",
  ].join(" ");
}

function ProfileMenu({
  fullName,
  orgName,
  role,
}: {
  fullName: string;
  orgName: string;
  role: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const initials = fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-sm font-semibold text-[var(--color-ink)] transition-colors hover:bg-[var(--color-surface-subtle)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
        aria-label="Abrir menu da conta"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        {initials || <IconUser className="h-5 w-5" aria-hidden />}
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Conta"
          className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-[var(--shadow-md)]"
        >
          <div className="border-b border-[var(--color-border)] px-3 py-2">
            <p className="truncate text-sm font-semibold text-[var(--color-ink)]">{fullName}</p>
            <p className="truncate text-xs text-[var(--color-ink-muted)]">{orgName}</p>
            <p className="truncate text-xs text-[var(--color-ink-muted)]">{role}</p>
          </div>
          <Link
            role="menuitem"
            href="/app/profile"
            className="block min-h-11 px-3 py-2.5 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-surface-subtle)]"
            onClick={() => setOpen(false)}
          >
            Conta e preferências
          </Link>
          <Link
            role="menuitem"
            href="/app/manual"
            className="block min-h-11 px-3 py-2.5 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-surface-subtle)]"
            onClick={() => setOpen(false)}
          >
            Manual
          </Link>
          <a
            role="menuitem"
            href={supportMailto()}
            className="block min-h-11 px-3 py-2.5 text-sm text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-ink)]"
            onClick={() => setOpen(false)}
          >
            Feedback / ajuda
          </a>
        </div>
      ) : null}
    </div>
  );
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
    <div
      className={[
        "mx-auto flex w-full max-w-6xl flex-col md:flex-row",
        assistantActive ? "h-dvh overflow-hidden" : "min-h-dvh",
      ].join(" ")}
    >
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
              const { Icon } = item;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={["inline-flex items-center gap-2.5", navLinkClass(active)].join(" ")}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon aria-hidden className="opacity-90" />
                  {item.label}
                </Link>
              );
            })}
            <Link
              href="/app/assistant"
              className={["mt-2", assistantLinkClass(assistantActive)].join(" ")}
              aria-current={assistantActive ? "page" : undefined}
              aria-label="Assistente com inteligência artificial"
            >
              <BrandMark size="xs" decorative />
              Assistente
              <Badge tone="ai">IA</Badge>
            </Link>
          </nav>
          <div className="space-y-1 border-t border-[var(--color-border)] px-4 py-3">
            <p className="truncate text-sm font-medium">{me.user.full_name}</p>
            <p className="truncate text-xs text-[var(--color-ink-muted)]">{me.role}</p>
            <Link
              href="/app/manual"
              className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--color-link)]"
            >
              Manual
            </Link>
            <a
              href={supportMailto()}
              className="block text-xs text-[var(--color-ink-muted)] underline-offset-2 hover:text-[var(--color-ink)] hover:underline"
            >
              Feedback / ajuda · {SUPPORT_EMAIL}
            </a>
          </div>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 shrink-0 border-b border-[var(--color-border)]/80 bg-[var(--color-bg)]/90 px-4 py-2.5 backdrop-blur md:hidden">
          <div className="flex items-center justify-between gap-2">
            <BrandWordmark size="sm" surface="light" compact />
            <div className="flex items-center gap-1.5">
              <Link
                href="/app/assistant"
                className={assistantLinkClass(assistantActive)}
                aria-current={assistantActive ? "page" : undefined}
                aria-label="Assistente com inteligência artificial"
              >
                <BrandMark size="xs" decorative />
                <span className="text-sm">IA</span>
              </Link>
              <ProfileMenu
                fullName={me.user.full_name}
                orgName={me.organization.name}
                role={me.role}
              />
            </div>
          </div>
        </header>

        <main
          className={
            assistantActive
              ? "flex min-h-0 flex-1 flex-col overflow-hidden p-0 pb-[calc(4.25rem+env(safe-area-inset-bottom,0px))] md:pb-0"
              : "flex-1 px-4 py-5 pb-28 md:px-6 md:pb-5"
          }
        >
          <BillingGate>{children}</BillingGate>
        </main>

        <nav
          aria-label="Navegação principal"
          className="app-bottom-nav fixed inset-x-0 bottom-0 border-t border-[var(--color-border)]/70 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden"
        >
          <div className="mx-auto flex max-w-lg items-stretch justify-between gap-0.5 px-1.5 py-1.5">
            {navItems.map((item) => {
              const active = isNavActive(pathname, item.href);
              const { Icon } = item;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-label={item.label}
                  aria-current={active ? "page" : undefined}
                  className={[
                    "flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[var(--radius-md)] px-1 py-1.5 text-[0.65rem] font-semibold transition-[background-color,color] duration-[var(--duration-fast)] sm:text-xs",
                    active
                      ? "bg-[var(--color-primary-subtle)] text-[var(--color-primary)]"
                      : "text-[var(--color-ink-muted)]",
                  ].join(" ")}
                >
                  <Icon
                    className={
                      active ? "h-[1.15rem] w-[1.15rem]" : "h-[1.15rem] w-[1.15rem] opacity-80"
                    }
                    aria-hidden
                  />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
