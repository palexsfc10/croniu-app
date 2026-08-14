"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentType,
  type SVGProps,
} from "react";
import { BrandMark, BrandWordmark } from "@/components/brand";
import { useAuth } from "@/components/auth/auth-provider";
import { Badge } from "@/components/ui/badge";
import {
  IconCalendarDays,
  IconCreditCard,
  IconHome,
  IconLayoutGrid,
  IconLifeBuoy,
  IconLogOut,
  IconClipboardList,
  IconUser,
  IconUsersRound,
} from "@/components/ui/icons";
import { BillingGate } from "@/components/billing/billing-gate";
import { PwaInstallBanner } from "@/components/pwa/pwa-install-banner";

const navItems: {
  href: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement> & { title?: string }>;
}[] = [
  { href: "/app", label: "Hoje", Icon: IconHome },
  { href: "/app/agenda", label: "Agenda", Icon: IconCalendarDays },
  { href: "/app/clients", label: "Clientes", Icon: IconUsersRound },
  { href: "/app/routines", label: "Rotinas", Icon: IconClipboardList },
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

function menuItemClass(danger = false) {
  return [
    "flex min-h-11 w-full items-center gap-2.5 px-3 py-2.5 text-sm font-semibold transition-colors",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-focus)]",
    danger
      ? "text-[var(--color-danger)] hover:bg-[var(--color-danger-subtle)]"
      : "text-[var(--color-ink)] hover:bg-[var(--color-surface-subtle)]",
  ].join(" ");
}

function ProfileMenu({
  fullName,
  orgName,
  onLogout,
}: {
  fullName: string;
  orgName: string;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
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
        triggerRef.current?.focus();
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={triggerRef}
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
          className="absolute right-0 z-30 mt-2 w-[min(17.5rem,calc(100vw-1.5rem))] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-[var(--shadow-md)]"
        >
          <div className="border-b border-[var(--color-border)] px-3 py-2.5">
            <p className="truncate text-sm font-semibold text-[var(--color-ink)]">{fullName}</p>
            <p className="truncate text-xs text-[var(--color-ink-muted)]">{orgName}</p>
          </div>
          <Link
            role="menuitem"
            href="/app/account"
            className={menuItemClass()}
            onClick={close}
          >
            <IconUser className="h-4 w-4 opacity-80" aria-hidden />
            Minha conta
          </Link>
          <Link
            role="menuitem"
            href="/app/billing"
            className={menuItemClass()}
            onClick={close}
          >
            <IconCreditCard className="h-4 w-4 opacity-80" aria-hidden />
            Assinatura
          </Link>
          <Link
            role="menuitem"
            href="/app/help"
            className={menuItemClass()}
            onClick={close}
          >
            <IconLifeBuoy className="h-4 w-4 opacity-80" aria-hidden />
            Ajuda e feedback
          </Link>
          <div className="my-1 border-t border-[var(--color-border)]" />
          <button
            type="button"
            role="menuitem"
            className={menuItemClass(true)}
            onClick={() => {
              close();
              onLogout();
            }}
          >
            <IconLogOut className="h-4 w-4 opacity-80" aria-hidden />
            Sair
          </button>
        </div>
      ) : null}
    </div>
  );
}

function AccountSidebarLinks({
  fullName,
  orgName,
  onLogout,
}: {
  fullName: string;
  orgName: string;
  onLogout: () => void;
}) {
  return (
    <div className="space-y-0.5 border-t border-[var(--color-border)] px-2 py-3">
      <div className="px-2 pb-2">
        <p className="truncate text-sm font-semibold text-[var(--color-ink)]">{fullName}</p>
        <p className="truncate text-xs text-[var(--color-ink-muted)]">{orgName}</p>
      </div>
      <Link
        href="/app/account"
        className="flex min-h-10 items-center gap-2 rounded-[var(--radius-md)] px-2 py-2 text-sm font-medium text-[var(--color-ink)] hover:bg-[var(--color-surface-subtle)]"
      >
        <IconUser className="h-4 w-4 opacity-80" aria-hidden />
        Minha conta
      </Link>
      <Link
        href="/app/billing"
        className="flex min-h-10 items-center gap-2 rounded-[var(--radius-md)] px-2 py-2 text-sm font-medium text-[var(--color-ink)] hover:bg-[var(--color-surface-subtle)]"
      >
        <IconCreditCard className="h-4 w-4 opacity-80" aria-hidden />
        Assinatura
      </Link>
      <Link
        href="/app/help"
        className="flex min-h-10 items-center gap-2 rounded-[var(--radius-md)] px-2 py-2 text-sm font-medium text-[var(--color-ink)] hover:bg-[var(--color-surface-subtle)]"
      >
        <IconLifeBuoy className="h-4 w-4 opacity-80" aria-hidden />
        Ajuda e feedback
      </Link>
      <button
        type="button"
        onClick={onLogout}
        className="flex min-h-10 w-full items-center gap-2 rounded-[var(--radius-md)] px-2 py-2 text-sm font-medium text-[var(--color-danger)] hover:bg-[var(--color-danger-subtle)]"
      >
        <IconLogOut className="h-4 w-4 opacity-80" aria-hidden />
        Sair
      </button>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { me, loading, logout } = useAuth();

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
  const doLogout = () => {
    void logout();
  };

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
          <AccountSidebarLinks
            fullName={me.user.full_name}
            orgName={me.organization.name}
            onLogout={doLogout}
          />
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
                onLogout={doLogout}
              />
            </div>
          </div>
        </header>

        <PwaInstallBanner />

        <main
          className={
            assistantActive
              ? "flex min-h-0 flex-1 flex-col overflow-hidden p-0 pb-[calc(4.25rem+env(safe-area-inset-bottom,0px))] md:pb-0"
              : "flex-1 px-4 py-5 pb-[calc(7rem+env(safe-area-inset-bottom,0px))] md:px-6 md:pb-5"
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
