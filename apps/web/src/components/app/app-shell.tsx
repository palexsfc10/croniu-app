"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type SVGProps,
} from "react";
import { BrandMark, BrandWordmark } from "@/components/brand";
import { CommandPalette } from "@/components/app/command-palette";
import { useAuth } from "@/components/auth/auth-provider";
import { Badge } from "@/components/ui/badge";
import { apiFetch, type MyReferral } from "@/lib/api";
import {
  IconActivity,
  IconCalendarDays,
  IconCreditCard,
  IconHome,
  IconLayoutGrid,
  IconLifeBuoy,
  IconLogOut,
  IconClipboardList,
  IconLink,
  IconSearch,
  IconSparkles,
  IconUser,
  IconUsersRound,
} from "@/components/ui/icons";
import { BillingGate } from "@/components/billing/billing-gate";
import { PwaInstallBanner } from "@/components/pwa/pwa-install-banner";
import {
  type CroniuBeforeInstallPromptEvent,
  emitPwaInstallTelemetry,
  setDeferredInstallPrompt,
  writeInstalledMark,
} from "@/lib/pwa-install";
import { safeLocalStorage } from "@/lib/use-pwa-install-surface";

const navItems: {
  href: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement> & { title?: string }>;
}[] = [
  { href: "/app", label: "Início", Icon: IconHome },
  { href: "/app/agenda", label: "Agenda", Icon: IconCalendarDays },
  { href: "/app/clients", label: "Clientes", Icon: IconUsersRound },
  { href: "/app/accompaniment", label: "Acompanhamentos", Icon: IconActivity },
  { href: "/app/routines", label: "Rotinas", Icon: IconClipboardList },
  { href: "/app/profile", label: "Mais", Icon: IconLayoutGrid },
];

/** Mobile bottom tab bar only — Assistente takes the center slot, in
 * destaque, per "mobile é a camada operacional principal da IA". Rotinas
 * stays a full desktop sidebar item (`navItems` above, untouched) and is
 * still reachable on mobile via Mais → Rotinas (profile/page.tsx), so
 * nothing existing disappears — it just isn't a primary tab anymore. */
const mobileNavItems: {
  href: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement> & { title?: string }>;
}[] = [
  { href: "/app", label: "Início", Icon: IconHome },
  { href: "/app/agenda", label: "Agenda", Icon: IconCalendarDays },
  { href: "/app/assistant", label: "Assistente", Icon: IconSparkles },
  { href: "/app/clients", label: "Clientes", Icon: IconUsersRound },
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
  // Active state reads as "quietly current" rather than a loud filled pill:
  // a raised-but-faint surface + a thin brand rail on the left, same
  // vocabulary as .card-rail elsewhere, not a new pattern.
  return [
    "min-h-11 rounded-[var(--radius-md)] border-l-2 py-2 pr-3 text-sm font-semibold transition-colors duration-[var(--duration-fast)]",
    active
      ? "border-l-[var(--color-primary)] bg-[var(--color-surface-elevated)] pl-[calc(0.75rem-2px)] text-[var(--color-primary)] shadow-sm"
      : "border-l-transparent pl-3 text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-ink)]",
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
  showReferralLink,
  onLogout,
}: {
  fullName: string;
  orgName: string;
  showReferralLink: boolean;
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
          className="absolute right-0 z-30 mt-2 w-[min(17.5rem,calc(100vw-1.5rem))] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-md"
        >
          <div className="border-b border-[var(--color-border)] px-3 py-2.5">
            <p className="truncate text-sm font-semibold text-[var(--color-ink)]">{fullName}</p>
            <p className="truncate text-xs text-[var(--color-ink-muted)]">{orgName}</p>
          </div>
          <Link
            role="menuitem"
            href="/app/settings/account"
            className={menuItemClass()}
            onClick={close}
          >
            <IconUser className="h-4 w-4 opacity-80" aria-hidden />
            Minha conta
          </Link>
          <Link
            role="menuitem"
            href="/app/settings/billing"
            className={menuItemClass()}
            onClick={close}
          >
            <IconCreditCard className="h-4 w-4 opacity-80" aria-hidden />
            Plano e assinatura
          </Link>
          <Link
            role="menuitem"
            href="/app/settings/help"
            className={menuItemClass()}
            onClick={close}
          >
            <IconLifeBuoy className="h-4 w-4 opacity-80" aria-hidden />
            Ajuda e feedback
          </Link>
          {showReferralLink ? (
            <Link
              role="menuitem"
              href="/app/referrals"
              className={menuItemClass()}
              onClick={close}
            >
              <IconLink className="h-4 w-4 opacity-80" aria-hidden />
              Meu link de indicação
            </Link>
          ) : null}
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
  showReferralLink,
  onLogout,
}: {
  fullName: string;
  orgName: string;
  showReferralLink: boolean;
  onLogout: () => void;
}) {
  return (
    <div className="space-y-0.5 border-t border-[var(--color-border)] px-2 py-3">
      <div className="px-2 pb-2">
        <p className="truncate text-sm font-semibold text-[var(--color-ink)]">{fullName}</p>
        <p className="truncate text-xs text-[var(--color-ink-muted)]">{orgName}</p>
      </div>
      <Link
        href="/app/settings/account"
        className="flex min-h-10 items-center gap-2 rounded-[var(--radius-md)] px-2 py-2 text-sm font-medium text-[var(--color-ink)] hover:bg-[var(--color-surface-subtle)]"
      >
        <IconUser className="h-4 w-4 opacity-80" aria-hidden />
        Minha conta
      </Link>
      <Link
        href="/app/settings/billing"
        className="flex min-h-10 items-center gap-2 rounded-[var(--radius-md)] px-2 py-2 text-sm font-medium text-[var(--color-ink)] hover:bg-[var(--color-surface-subtle)]"
      >
        <IconCreditCard className="h-4 w-4 opacity-80" aria-hidden />
        Plano e assinatura
      </Link>
      <Link
        href="/app/settings/help"
        className="flex min-h-10 items-center gap-2 rounded-[var(--radius-md)] px-2 py-2 text-sm font-medium text-[var(--color-ink)] hover:bg-[var(--color-surface-subtle)]"
      >
        <IconLifeBuoy className="h-4 w-4 opacity-80" aria-hidden />
        Ajuda e feedback
      </Link>
      {showReferralLink ? (
        <Link
          href="/app/referrals"
          className="flex min-h-10 items-center gap-2 rounded-[var(--radius-md)] px-2 py-2 text-sm font-medium text-[var(--color-ink)] hover:bg-[var(--color-surface-subtle)]"
        >
          <IconLink className="h-4 w-4 opacity-80" aria-hidden />
          Meu link de indicação
        </Link>
      ) : null}
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

/** True only on the HML hostname — never on PRD. useSyncExternalStore (not a
 * state-in-effect) is the React-sanctioned way to read a value that only
 * exists client-side without a hydration mismatch: the server snapshot is
 * always false, so the badge simply isn't there for the initial paint. */
const noopSubscribe = () => () => {};
function useIsHmlEnvironment() {
  return useSyncExternalStore(
    noopSubscribe,
    () => window.location.hostname.startsWith("croniu-hml"),
    () => false,
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { me, loading, logout } = useAuth();
  const [referral, setReferral] = useState<MyReferral | null>(null);
  const isHml = useIsHmlEnvironment();

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    void apiFetch<MyReferral>("/api/v1/referrals/me").then((result) => {
      if (!cancelled && result.data) setReferral(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [me]);

  // Captured once here, regardless of which page is mounted at the moment
  // the browser fires it, so the "Instalar Croniu" entry in Mais can still
  // offer the native prompt even if the user never saw the home banner.
  useEffect(() => {
    function onBeforeInstall(event: Event) {
      event.preventDefault();
      setDeferredInstallPrompt(event as CroniuBeforeInstallPromptEvent);
    }
    function onAppInstalled() {
      // Mark first: setDeferredInstallPrompt notifies subscribers
      // synchronously, so the installed mark must already be on disk by
      // then for that same recompute pass to see it.
      const storage = safeLocalStorage();
      if (storage) writeInstalledMark(storage);
      setDeferredInstallPrompt(null);
      emitPwaInstallTelemetry("pwa_installed");
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

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
        "flex w-full flex-col md:flex-row",
        assistantActive ? "h-dvh overflow-hidden" : "min-h-dvh",
      ].join(" ")}
    >
      <aside className="app-sidebar hidden border-[var(--color-border)] md:flex md:w-56 md:shrink-0 md:flex-col md:border-r xl:w-64">
        <div className="sticky top-0 flex min-h-dvh flex-col">
          <div className="px-4 py-4">
            <div className="flex items-baseline gap-1.5">
              <BrandWordmark size="sm" surface="light" compact />
              <span className="text-sm font-normal text-[var(--color-ink-subtle)]">Workspace</span>
            </div>
            {isHml ? (
              <span className="mt-1.5 inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-2 py-0.5 text-[0.65rem] font-semibold text-[var(--color-ink-muted)]">
                Ambiente de homologação
              </span>
            ) : null}
            <p className="mt-1.5 truncate text-xs text-[var(--color-ink-muted)]">
              {me.organization.name}
            </p>
          </div>
          <div className="px-2 pb-2">
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent("croniu:open-command-palette"))}
              className="flex min-h-10 w-full items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-ink-muted)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-ink)]"
            >
              <IconSearch className="h-4 w-4 opacity-70" aria-hidden />
              <span className="flex-1 text-left">Buscar ou perguntar</span>
              <kbd className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-1.5 py-0.5 text-[0.65rem] font-semibold text-[var(--color-ink-subtle)]">
                ⌘K
              </kbd>
            </button>
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
            showReferralLink={referral?.enabled ?? false}
            onLogout={doLogout}
          />
          <p className="px-4 py-2 text-[0.65rem] font-medium text-[var(--color-ink-subtle)] opacity-70">
            by NTWS Labs
          </p>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 shrink-0 border-b border-[var(--color-border)]/80 bg-[var(--color-bg)]/90 px-4 py-2.5 backdrop-blur md:hidden">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <BrandWordmark size="sm" surface="light" compact />
              {isHml ? (
                <span className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-1.5 py-0.5 text-[0.6rem] font-semibold text-[var(--color-ink-muted)]">
                  HML
                </span>
              ) : null}
            </div>
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
                showReferralLink={referral?.enabled ?? false}
                onLogout={doLogout}
              />
            </div>
          </div>
        </header>

        {pathname === "/app" ? <PwaInstallBanner /> : null}

        <main
          // Bottom padding clears the fixed mobile bottom-nav height + its
          // safe-area inset (7rem normally, 4.25rem on the assistant screen
          // which has its own composer instead of a page scroll) — not a
          // token because it's shell-chrome-specific, not a design value.
          className={
            assistantActive
              ? "flex min-h-0 flex-1 flex-col overflow-hidden p-0 pb-[calc(4.25rem+env(safe-area-inset-bottom,0px))] md:pb-0"
              : "flex-1 px-4 py-5 pb-[calc(7rem+env(safe-area-inset-bottom,0px))] md:px-6 md:py-6 md:pb-5 xl:px-8"
          }
        >
          {/* Sidebar+content no longer share one global max-width (that centered
              the whole shell and wasted the sides on wide screens) — the cap
              lives here instead, on main's own content, so it can be wide
              enough for dashboards/grids without becoming an unreadable full-
              bleed slab on ultrawide monitors. The assistant screen manages its
              own internal columns and needs the full height chain intact. */}
          <div
            className={
              assistantActive
                ? "flex h-full min-h-0 w-full flex-1 flex-col"
                : "mx-auto w-full max-w-[1600px] 2xl:max-w-[1760px]"
            }
          >
            <BillingGate>{children}</BillingGate>
          </div>
        </main>

        <nav
          aria-label="Navegação principal"
          className="app-bottom-nav fixed inset-x-0 bottom-0 border-t border-[var(--color-border)]/70 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden"
        >
          <div className="mx-auto flex max-w-lg items-stretch justify-between gap-0.5 px-1.5 py-1.5">
            {mobileNavItems.map((item) => {
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
      <CommandPalette />
    </div>
  );
}
