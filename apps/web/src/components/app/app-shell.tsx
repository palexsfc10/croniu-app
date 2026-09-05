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
import {
  AssistantLayerProvider,
  useAssistantLayer,
  useAssistantPanelSpacing,
} from "@/components/app/assistant/assistant-layer-provider";
import { useAuth } from "@/components/auth/auth-provider";
import { Badge } from "@/components/ui/badge";
import { apiFetch, type MyReferral } from "@/lib/api";
import { useIsHmlEnvironment } from "@/lib/environment";
import {
  IconActivity,
  IconBanknote,
  IconBriefcase,
  IconCalendarDays,
  IconCalendarPlus,
  IconChevronLeft,
  IconChevronRight,
  IconCreditCard,
  IconExternalLink,
  IconHome,
  IconLayers,
  IconLayoutGrid,
  IconLifeBuoy,
  IconLogOut,
  IconClipboardList,
  IconLink,
  IconMapPin,
  IconPlus,
  IconRefreshCw,
  IconSearch,
  IconShieldCheck,
  IconSliders,
  IconSparkles,
  IconUser,
  IconUsersRound,
} from "@/components/ui/icons";
import { MenuItem } from "@/components/ui/menu-item";
import { displayTerm, nomenclatureFor } from "@/lib/nomenclature";
import { BillingGate } from "@/components/billing/billing-gate";
import { PwaInstallBanner } from "@/components/pwa/pwa-install-banner";
import {
  type CroniuBeforeInstallPromptEvent,
  emitPwaInstallTelemetry,
  setDeferredInstallPrompt,
  writeInstalledMark,
} from "@/lib/pwa-install";
import { safeLocalStorage } from "@/lib/use-pwa-install-surface";

type NavItem = {
  href: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement> & { title?: string }>;
};

/** Desktop sidebar groups — the Lab's conceptual hierarchy (Principal /
 * Trabalho / Gestão) adapted to the routes that actually exist today. Only
 * destinations with a real page are listed; "Avaliações" isn't its own
 * group here because /app/accompaniment already *is* the avaliações-driven
 * work surface (see its own rebuild), and a second entry pointing at the
 * same place would be exactly the kind of duplicate-without-distinction
 * the redesign is meant to remove. */
const SIDEBAR_COLLAPSED_KEY = "croniu:sidebar-collapsed";

// Same useSyncExternalStore-backed localStorage flag idiom as the initial
// setup card's collapse state (lib/setup-copy.ts) — avoids both a
// hydration mismatch (first client render must match SSR) and the
// setState-in-effect anti-pattern a plain useState+useEffect would need.
const sidebarCollapseListeners = new Set<() => void>();

function subscribeSidebarCollapsed(onStoreChange: () => void) {
  sidebarCollapseListeners.add(onStoreChange);
  return () => {
    sidebarCollapseListeners.delete(onStoreChange);
  };
}

function getSidebarCollapsedSnapshot(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function setSidebarCollapsedStorage(collapsed: boolean) {
  try {
    if (collapsed) window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, "1");
    else window.localStorage.removeItem(SIDEBAR_COLLAPSED_KEY);
  } catch {
    /* ignore */
  }
  sidebarCollapseListeners.forEach((cb) => cb());
}

const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "Principal",
    items: [
      { href: "/app", label: "Início", Icon: IconHome },
      { href: "/app/clients", label: "Clientes", Icon: IconUsersRound },
      { href: "/app/agenda", label: "Agenda", Icon: IconCalendarDays },
    ],
  },
  {
    label: "Trabalho",
    items: [
      { href: "/app/routines", label: "Rotinas", Icon: IconClipboardList },
      { href: "/app/accompaniment", label: "Acompanhamentos", Icon: IconActivity },
    ],
  },
  {
    label: "Gestão",
    items: [
      { href: "/app/cycles", label: "Ciclos e renovações", Icon: IconRefreshCw },
      { href: "/app/receivables", label: "Financeiro", Icon: IconBanknote },
      { href: "/app/services", label: "Serviços", Icon: IconLayers },
    ],
  },
];

/** Mobile bottom tab bar only — Cronia takes the center slot, in
 * destaque, per "mobile é a camada operacional principal da IA". Rotinas
 * stays a full desktop sidebar item (`navGroups` above, untouched) and is
 * still reachable on mobile via Mais → Rotinas (profile/page.tsx), so
 * nothing existing disappears — it just isn't a primary tab anymore. */
const mobileNavItems: NavItem[] = [
  { href: "/app", label: "Início", Icon: IconHome },
  { href: "/app/agenda", label: "Agenda", Icon: IconCalendarDays },
  { href: "/app/assistant", label: "Cronia", Icon: IconSparkles },
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

function navLinkClass(active: boolean, collapsed = false) {
  // Active state reads as "quietly current" rather than a loud filled pill:
  // a raised-but-faint surface + a brand rail on the left, same vocabulary
  // as .card-rail elsewhere, not a new pattern. Piloto: rail thickened
  // (2px → 3px) and the fill deepened from --color-surface-elevated (a
  // near-invisible 3% tint) to a visible-but-calm 10% brand mix, for real
  // presence without becoming a filled pill. No shadow — a "floating"
  // nav item reads as a button, not a location in a list. Collapsed: no
  // room for the left rail + asymmetric padding trick, so the active state
  // falls back to a plain centered fill instead.
  if (collapsed) {
    return [
      "flex min-h-11 items-center justify-center rounded-[var(--radius-md)] text-sm font-semibold transition-colors duration-[var(--duration-fast)]",
      active
        ? "bg-[var(--color-nav-active-bg)] text-[var(--color-primary)]"
        : "text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-ink)]",
    ].join(" ");
  }
  return [
    "min-h-11 rounded-[var(--radius-md)] border-l-[3px] py-2 pr-3 text-sm font-semibold transition-colors duration-[var(--duration-fast)]",
    active
      ? "border-l-[var(--color-primary)] bg-[var(--color-nav-active-bg)] pl-[calc(0.75rem-3px)] text-[var(--color-primary)]"
      : "border-l-transparent pl-3 text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-ink)]",
  ].join(" ");
}

function assistantLinkClass(active: boolean, collapsed = false) {
  return [
    collapsed
      ? "flex min-h-11 items-center justify-center rounded-[var(--radius-md)] text-sm font-semibold transition-colors duration-[var(--duration-fast)]"
      : "inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-md)] px-2.5 py-2 text-sm font-semibold transition-colors duration-[var(--duration-fast)]",
    active
      ? "bg-[var(--color-ai-subtle)] text-[var(--color-ai-hover)]"
      : "text-[var(--color-ai)] hover:bg-[var(--color-ai-subtle)]",
  ].join(" ");
}

/** Desktop sidebar's "Cronia" row — opens the persistent side panel
 * instead of navigating away, per the layer fatia. `/app/assistant` stays
 * reachable as a deep link/full page; this is just no longer how the
 * sidebar itself gets there. */
function AssistantSidebarButton({ active, collapsed = false }: { active: boolean; collapsed?: boolean }) {
  const { open, visible } = useAssistantLayer();
  return (
    <button
      type="button"
      title={collapsed ? "Cronia" : undefined}
      className={[
        collapsed ? "group/navitem relative flex w-full justify-center" : "w-full",
        assistantLinkClass(active, collapsed),
      ].join(" ")}
      aria-label="Abrir a Cronia"
      onClick={() => open()}
    >
      <span
        aria-hidden
        className={["cronia-symbol flex h-5 w-5 shrink-0 items-center justify-center rounded-full", active || visible ? "is-active" : ""].join(" ")}
      >
        <IconSparkles className="h-3 w-3 text-white" />
      </span>
      {!collapsed ? (
        <>
          Cronia
          <Badge tone="ai">IA</Badge>
        </>
      ) : (
        <span
          role="tooltip"
          className="pointer-events-none absolute left-full top-1/2 z-30 ml-2 -translate-y-1/2 whitespace-nowrap rounded-[var(--radius-sm)] bg-[var(--color-ink)] px-2 py-1 text-xs font-medium text-white opacity-0 shadow-md transition-opacity duration-[var(--duration-fast)] group-hover/navitem:opacity-100"
        >
          Cronia
        </span>
      )}
    </button>
  );
}

/** Wraps the routed page content — adds right padding equal to the desktop
 * panel's width while it's open, so page content reflows instead of
 * sitting behind the panel. `useAssistantPanelSpacing` returns an inline
 * `style`, not a class, on purpose — see its own comment for why a
 * Tailwind class silently lost the cascade here. */
function MainContent({ assistantActive, children }: { assistantActive: boolean; children: React.ReactNode }) {
  const { style: panelSpacingStyle } = useAssistantPanelSpacing();
  return (
    <main
      // Bottom padding clears the fixed mobile bottom-nav height + its
      // safe-area inset (7rem normally, 4.25rem on the assistant screen
      // which has its own composer instead of a page scroll) — not a
      // token because it's shell-chrome-specific, not a design value.
      className={[
        assistantActive
          ? "flex min-h-0 flex-1 flex-col overflow-hidden p-0 pb-[calc(4.25rem+env(safe-area-inset-bottom,0px))] lg:pb-0"
          : "shell-main-wash flex-1 px-4 py-5 pb-[calc(7rem+env(safe-area-inset-bottom,0px))] lg:px-6 lg:py-6 lg:pb-5 xl:px-8",
        "transition-[padding] duration-[var(--duration-normal)]",
      ].join(" ")}
      style={panelSpacingStyle}
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
  );
}

/** The bottom-nav orb — the primary mobile entry point into the Assistant.
 * Opens the persistent overlay layer instead of navigating; see
 * `assistant-layer-provider.tsx`. */
function AssistantOrbTab({
  label,
  Icon,
  active,
}: {
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement> & { title?: string }>;
  active: boolean;
}) {
  const { open, visible } = useAssistantLayer();
  // Discreet at rest, grows and glows fully once opened/focused — the orb
  // shouldn't be the loudest thing on the bottom nav until it's actually
  // in use. `transition-[width,height]` (not `transform: scale`) so the
  // glow halo positioned around it via `inset` doesn't need to co-animate.
  const isOn = active || visible;
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => open()}
      className="flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[0.65rem] font-semibold text-[var(--color-ai-hover)] sm:text-xs"
    >
      <span className="relative -mt-3 flex h-11 w-11 items-center justify-center">
        <span className={`assistant-orb-glow ${isOn ? "" : "assistant-orb-glow--idle"}`} aria-hidden />
        <span
          className={[
            "assistant-orb relative z-[1] flex items-center justify-center rounded-full transition-[width,height] duration-[var(--duration-normal)]",
            isOn ? "h-11 w-11 ring-2 ring-[var(--color-ai)] ring-offset-2 ring-offset-[var(--color-surface)]" : "h-9 w-9",
          ].join(" ")}
        >
          <Icon className={isOn ? "h-5 w-5 text-[var(--color-ai-foreground)]" : "h-4 w-4 text-[var(--color-ai-foreground)]"} aria-hidden />
        </span>
      </span>
      <span className="truncate">{label}</span>
    </button>
  );
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

/**
 * The single place the professional's name/workspace surfaces — the
 * sidebar itself no longer prints it (piloto: "reconstrução radical",
 * seção 2). Two mount points share this component: the mobile topbar
 * (always) and the desktop topbar (new). They intentionally show
 * slightly different rows — desktop has its own separate "Ajuda" menu in
 * the topbar, so repeating "Ajuda e feedback" here would be the exact
 * kind of duplicate-without-distinction entry point the redesign is
 * meant to remove; mobile has no such second entry point, so it keeps
 * it. Design System is gone from both — it stays reachable only by
 * typing the (server-gated) dev route directly, never from navegação
 * comum.
 */
function ProfileMenu({
  fullName,
  orgName,
  showReferralLink,
  desktop = false,
  onLogout,
}: {
  fullName: string;
  orgName: string;
  showReferralLink: boolean;
  desktop?: boolean;
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
            href="/app/settings/workspace"
            className={menuItemClass()}
            onClick={close}
          >
            <IconBriefcase className="h-4 w-4 opacity-80" aria-hidden />
            Workspace
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
            href="/app/locations"
            className={menuItemClass()}
            onClick={close}
          >
            <IconMapPin className="h-4 w-4 opacity-80" aria-hidden />
            Preferências
          </Link>
          {!desktop ? (
            <Link
              role="menuitem"
              href="/app/settings/help"
              className={menuItemClass()}
              onClick={close}
            >
              <IconLifeBuoy className="h-4 w-4 opacity-80" aria-hidden />
              Ajuda e feedback
            </Link>
          ) : null}
          <Link
            role="menuitem"
            href="/app/profile#instalar-croniu"
            className={menuItemClass()}
            onClick={close}
          >
            <IconExternalLink className="h-4 w-4 opacity-80" aria-hidden />
            Instalar Croniu
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

/** Shared open/close-on-outside-click/Escape shell for the topbar's small
 * dropdowns (Criar, Ajuda) — same interaction contract as ProfileMenu,
 * factored out once both needed it instead of copy-pasting a third time. */
function useDropdown() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
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

  return { open, setOpen, rootRef, triggerRef, close: () => setOpen(false) };
}

function dropdownPanelClass() {
  return "absolute right-0 z-30 mt-2 w-64 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-md";
}

/** Topbar "+ Criar" — the one place to start any of the three things a
 * professional creates day to day. Reuses the real creation destinations
 * (client intake, appointment form, the routines page's own create
 * dialog) instead of building a second, parallel creation flow. */
function CreateMenu() {
  const { open, setOpen, rootRef, triggerRef, close } = useDropdown();
  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="inline-flex min-h-10 items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3.5 text-sm font-semibold text-[var(--color-primary-foreground)] transition-colors hover:bg-[var(--color-primary-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <IconPlus className="h-4 w-4" aria-hidden />
        Criar
      </button>
      {open ? (
        <div role="menu" aria-label="Criar" className={dropdownPanelClass()}>
          <MenuItem
            role="menuitem"
            href="/app/clients/new"
            icon={<IconUser className="h-4 w-4 opacity-80" aria-hidden />}
            onClick={close}
          >
            Novo cliente
          </MenuItem>
          <MenuItem
            role="menuitem"
            href="/app/appointments/new"
            icon={<IconCalendarPlus className="h-4 w-4 opacity-80" aria-hidden />}
            onClick={close}
          >
            Novo compromisso
          </MenuItem>
          <MenuItem
            role="menuitem"
            href="/app/routines?new=1"
            icon={<IconClipboardList className="h-4 w-4 opacity-80" aria-hidden />}
            onClick={close}
          >
            Nova rotina
          </MenuItem>
        </div>
      ) : null}
    </div>
  );
}

/** Topbar "Ajuda" — consolidates the manual, keyboard shortcuts, the real
 * feedback channel (there is only one today — Suporte and Feedback point
 * at the same form on purpose, not two fake channels) and the legal
 * pages. No sino/notificações here or anywhere in the topbar. */
function HelpMenu() {
  const { open, setOpen, rootRef, triggerRef, close } = useDropdown();
  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="inline-flex min-h-10 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm font-medium text-[var(--color-ink-muted)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <IconLifeBuoy className="h-4 w-4 opacity-80" aria-hidden />
        Ajuda
      </button>
      {open ? (
        <div role="menu" aria-label="Ajuda" className={dropdownPanelClass()}>
          <MenuItem
            role="menuitem"
            href="/app/manual"
            icon={<IconLifeBuoy className="h-4 w-4 opacity-80" aria-hidden />}
            onClick={close}
          >
            Manual do Croniu
          </MenuItem>
          <MenuItem
            role="menuitem"
            icon={<IconSliders className="h-4 w-4 opacity-80" aria-hidden />}
            onClick={() => window.dispatchEvent(new CustomEvent("croniu:open-command-palette"))}
          >
            Atalhos · ⌘K busca rápida
          </MenuItem>
          <MenuItem
            role="menuitem"
            href="/app/settings/help"
            icon={<IconLifeBuoy className="h-4 w-4 opacity-80" aria-hidden />}
            onClick={close}
          >
            Feedback e suporte
          </MenuItem>
          <div className="my-1 border-t border-[var(--color-border)]" />
          <MenuItem
            role="menuitem"
            href="/termos"
            external
            icon={<IconShieldCheck className="h-4 w-4 opacity-80" aria-hidden />}
          >
            Termos de uso
          </MenuItem>
          <MenuItem
            role="menuitem"
            href="/privacidade"
            external
            icon={<IconShieldCheck className="h-4 w-4 opacity-80" aria-hidden />}
          >
            Política de privacidade
          </MenuItem>
        </div>
      ) : null}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { me, loading, logout } = useAuth();
  const [referral, setReferral] = useState<MyReferral | null>(null);
  const isHml = useIsHmlEnvironment();
  const sidebarCollapsed = useSyncExternalStore(
    subscribeSidebarCollapsed,
    getSidebarCollapsedSnapshot,
    () => false,
  );

  function toggleSidebarCollapsed() {
    setSidebarCollapsedStorage(!sidebarCollapsed);
  }

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

  // The Clientes page itself, the manual and onboarding already adapt this
  // word by profession (e.g. "alunos" for a personal trainer) — the shell's
  // own nav used to hard-code "Clientes" regardless, which is exactly the
  // sidebar-vs-título mismatch flagged in the evidence review. One
  // resolved label, reused everywhere the shell prints this item.
  const clientsLabel = displayTerm(nomenclatureFor(me.organization.profession_code).clients);
  function resolveLabel(item: NavItem): string {
    return item.href === "/app/clients" ? clientsLabel : item.label;
  }

  return (
    <AssistantLayerProvider>
    <div
      className={[
        "flex w-full flex-col lg:flex-row",
        assistantActive ? "h-dvh overflow-hidden" : "min-h-dvh",
      ].join(" ")}
    >
      <aside
        className={[
          "app-sidebar hidden border-[var(--color-border)] lg:flex lg:shrink-0 lg:flex-col lg:border-r",
          sidebarCollapsed ? "lg:w-[4.5rem]" : "lg:w-56 xl:w-64",
        ].join(" ")}
      >
        <div className="sticky top-0 flex min-h-dvh flex-col">
          <div className={sidebarCollapsed ? "flex justify-center px-2 py-4" : "px-4 py-4"}>
            {sidebarCollapsed ? (
              <BrandMark size="sm" />
            ) : (
              <>
                <div className="flex items-baseline gap-1.5">
                  <BrandWordmark size="sm" surface="light" compact />
                  <span className="text-sm font-normal text-[var(--color-ink-subtle)]">Workspace</span>
                </div>
                {isHml ? (
                  <span className="mt-1.5 inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-2 py-0.5 text-[0.65rem] font-semibold text-[var(--color-ink-muted)]">
                    Ambiente de homologação
                  </span>
                ) : null}
              </>
            )}
          </div>
          <nav
            aria-label="Navegação principal"
            className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 pb-3"
          >
            {navGroups.map((group) => (
              <div key={group.label} className="mb-1">
                {!sidebarCollapsed ? (
                  <p className="px-3 pb-1 pt-3 text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--color-ink-subtle)]">
                    {group.label}
                  </p>
                ) : (
                  <div className="pt-3" aria-hidden />
                )}
                <div className="flex flex-col gap-1">
                  {group.items.map((item) => {
                    const active = isNavActive(pathname, item.href);
                    const { Icon } = item;
                    const label = resolveLabel(item);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        title={sidebarCollapsed ? label : undefined}
                        className={[
                          sidebarCollapsed ? "justify-center" : "inline-flex items-center gap-2.5",
                          "group/navitem relative",
                          navLinkClass(active, sidebarCollapsed),
                        ].join(" ")}
                        aria-current={active ? "page" : undefined}
                      >
                        <Icon aria-hidden className={active ? "opacity-100" : "opacity-90"} />
                        {!sidebarCollapsed ? label : null}
                        {sidebarCollapsed ? (
                          <span
                            role="tooltip"
                            className="pointer-events-none absolute left-full top-1/2 z-30 ml-2 -translate-y-1/2 whitespace-nowrap rounded-[var(--radius-sm)] bg-[var(--color-ink)] px-2 py-1 text-xs font-medium text-white opacity-0 shadow-md transition-opacity duration-[var(--duration-fast)] group-hover/navitem:opacity-100"
                          >
                            {label}
                          </span>
                        ) : null}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
            {/* Cronia reads as a special layer, not one more item in the
                operational list — spacing + a hairline divider carry that
                hierarchy; no group label, which would add noise for a
                single item. */}
            <div className="mt-3 border-t border-[var(--color-border)] pt-3">
              {!sidebarCollapsed ? (
                <p className="px-3 pb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--color-ink-subtle)]">
                  Experiência
                </p>
              ) : null}
              <AssistantSidebarButton active={assistantActive} collapsed={sidebarCollapsed} />
            </div>
          </nav>
          <div className="border-t border-[var(--color-border)] px-2 py-2.5">
            <button
              type="button"
              onClick={toggleSidebarCollapsed}
              aria-label={sidebarCollapsed ? "Expandir menu" : "Recolher menu"}
              className={[
                "flex min-h-9 w-full items-center gap-2 rounded-[var(--radius-md)] px-2 text-xs font-medium text-[var(--color-ink-subtle)] transition-colors hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-ink-muted)]",
                sidebarCollapsed ? "justify-center" : "justify-between",
              ].join(" ")}
            >
              {!sidebarCollapsed ? <span className="opacity-70">by NTWS Labs</span> : null}
              {sidebarCollapsed ? (
                <IconChevronRight className="h-4 w-4" aria-hidden />
              ) : (
                <IconChevronLeft className="h-4 w-4" aria-hidden />
              )}
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="app-topbar-mobile sticky top-0 z-10 shrink-0 border-b border-[var(--color-border)]/80 bg-[var(--color-bg)]/90 px-4 py-2.5 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <BrandWordmark size="sm" surface="light" compact />
              {isHml ? (
                <span className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-1.5 py-0.5 text-[0.6rem] font-semibold text-[var(--color-ink-muted)]">
                  HML
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Buscar"
                onClick={() => window.dispatchEvent(new CustomEvent("croniu:open-command-palette"))}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-ink)]"
              >
                <IconSearch className="h-5 w-5" aria-hidden />
              </button>
              <ProfileMenu
                fullName={me.user.full_name}
                orgName={me.organization.name}
                showReferralLink={referral?.enabled ?? false}
                onLogout={doLogout}
              />
            </div>
          </div>
        </header>

        <header className="app-topbar-desktop sticky top-0 z-10 hidden shrink-0 items-center gap-3 border-b border-[var(--color-border)]/80 bg-[var(--color-bg)]/90 px-6 py-3 backdrop-blur lg:flex">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("croniu:open-command-palette"))}
            className="flex min-h-10 w-full max-w-xl items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-ink-muted)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-ink)]"
          >
            <IconSearch className="h-4 w-4 opacity-70" aria-hidden />
            <span className="flex-1 truncate text-left">Buscar clientes, telas ou perguntar à Cronia</span>
            <kbd className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-1.5 py-0.5 text-[0.65rem] font-semibold text-[var(--color-ink-subtle)]">
              ⌘K
            </kbd>
          </button>
          <div className="flex-1" aria-hidden />
          <CreateMenu />
          <HelpMenu />
          <ProfileMenu
            fullName={me.user.full_name}
            orgName={me.organization.name}
            showReferralLink={referral?.enabled ?? false}
            desktop
            onLogout={doLogout}
          />
        </header>

        {pathname === "/app" ? <PwaInstallBanner /> : null}

        <MainContent assistantActive={assistantActive}>{children}</MainContent>

        <nav
          aria-label="Navegação principal"
          className="app-bottom-nav fixed inset-x-0 bottom-0 border-t border-[var(--color-border)]/70 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:hidden"
        >
          <div className="mx-auto flex max-w-lg items-stretch justify-between gap-0.5 px-1.5 py-1.5">
            {mobileNavItems.map((item) => {
              const active = isNavActive(pathname, item.href);
              const { Icon } = item;
              const label = resolveLabel(item);

              if (item.href === "/app/assistant") {
                return <AssistantOrbTab key={item.href} label={label} Icon={Icon} active={active} />;
              }

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-label={label}
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
                  <span className="truncate">{label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
      <CommandPalette />
    </div>
    </AssistantLayerProvider>
  );
}
