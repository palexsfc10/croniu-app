"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BrandWordmark } from "@/components/brand";
import { useAdminAuth } from "@/components/auth/admin-auth-provider";
import { EnvironmentBadge, EnvironmentIdentity } from "@/components/environment-identity";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { initials, statusLabel } from "@/lib/presentation";
import { IconBuilding, IconBug, IconCalendarCheck, IconDashboard, IconGift, IconLogOut, IconMenu, IconMessage, IconSearch, IconSparkles, IconUsers, IconX } from "@/components/ui/icons";

const groups = [
  { label: "Gestão", items: [
    { href: "/dashboard", label: "Visão geral", icon: IconDashboard },
    { href: "/organizations", label: "Organizações", icon: IconBuilding },
    { href: "/users", label: "Usuários", icon: IconUsers },
    { href: "/referrals", label: "Parceiros e indicações", icon: IconGift },
  ] },
  { label: "Operação e suporte", items: [
    { href: "/feedbacks", label: "Feedbacks", icon: IconMessage },
    { href: "/cycle-agenda", label: "Ciclo–agenda", icon: IconCalendarCheck },
    { href: "/ai", label: "Assistente IA", icon: IconSparkles },
    { href: "/errors", label: "Erros", icon: IconBug },
  ] },
];

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return <nav aria-label="Admin" className="space-y-7">
    {groups.map((group) => <div key={group.label}>
      <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--color-ink-muted)]">{group.label}</p>
      <div className="space-y-1">{group.items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return <Link key={href} href={href} onClick={onNavigate} className={`admin-nav-link ${active ? "admin-nav-active" : ""}`} aria-current={active ? "page" : undefined}>
          <Icon className="h-[18px] w-[18px] shrink-0" /><span>{label}</span>
          {active ? <span aria-hidden="true" className="ml-auto h-1.5 w-1.5 rounded-full bg-current" /> : null}
        </Link>;
      })}</div>
    </div>)}
  </nav>;
}

function BrandBlock() {
  return <div className="flex items-baseline gap-2.5">
    <BrandWordmark size="sm" surface="light" compact />
    <span className="rounded border border-[var(--color-border)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[var(--color-ink-muted)]">Admin</span>
  </div>;
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { me, loading, logout, logoutError } = useAdminAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const searchRef = useRef<HTMLInputElement>(null);
  const section = groups.flatMap((group) => group.items).find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));

  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      const target = event.target;
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey || drawerOpen) return;
      if (target instanceof HTMLElement && target.closest("input, textarea, select, [contenteditable='true'], [role='dialog']")) return;
      event.preventDefault();
      searchRef.current?.focus();
    }
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, [drawerOpen]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const closeOnDesktop = () => { if (media.matches) closeDrawer(); };
    media.addEventListener("change", closeOnDesktop);
    return () => media.removeEventListener("change", closeOnDesktop);
  }, [closeDrawer]);

  if (loading || !me) return <div className="flex min-h-dvh flex-col items-center justify-center gap-4" role="status">
    <BrandBlock /><p className="text-sm text-[var(--color-ink-muted)]">{loading ? "Carregando sessão administrativa…" : "Acesso negado. Redirecionando…"}</p>
  </div>;

  const operator = <div><div className="flex items-center gap-3">
    <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-subtle)] text-xs font-bold text-[var(--color-primary)]">{initials(me.full_name)}</span>
    <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{me.full_name}</p><p className="mt-0.5 text-xs text-[var(--color-ink-muted)]">{statusLabel(me.role)}</p></div>
    <Button variant="ghost" size="sm" aria-label="Sair" onClick={() => void logout()}><IconLogOut className="h-4 w-4" /></Button>
  </div>{logoutError ? <p role="alert" className="mt-2 text-xs text-[var(--color-danger)]">{logoutError}</p> : null}</div>;

  return <div className="admin-workspace flex min-h-dvh">
    <a href="#admin-content" className="skip-link">Pular para o conteúdo</a>
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] md:flex">
      <div className="px-6 pb-7 pt-7"><BrandBlock /><p className="mt-3 text-xs text-[var(--color-ink-muted)]">Central de controle</p></div>
      <div className="flex-1 overflow-y-auto px-3 py-2"><NavLinks pathname={pathname} /></div>
      <div className="mx-4 mb-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-3"><EnvironmentIdentity environment={me.environment} /></div>
      <div className="border-t border-[var(--color-border)] px-4 py-4">{operator}</div>
    </aside>

    <Modal open={drawerOpen} titleId="admin-navigation-title" onClose={closeDrawer} placement="drawer">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-5 py-5">
        <BrandBlock /><h2 id="admin-navigation-title" className="sr-only">Navegação</h2>
        <Button variant="ghost" aria-label="Fechar navegação" onClick={closeDrawer}><IconX className="h-5 w-5" /></Button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-6"><NavLinks pathname={pathname} onNavigate={closeDrawer} /></div>
      <EnvironmentIdentity environment={me.environment} className="px-5 pb-4" />
      <div className="border-t border-[var(--color-border)] p-4">{operator}</div>
    </Modal>

    <div className="min-w-0 flex-1">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 sm:px-6 lg:px-9">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="md:hidden" aria-label="Abrir navegação" aria-expanded={drawerOpen} onClick={() => setDrawerOpen(true)}><IconMenu className="h-5 w-5" /></Button>
            <p className="text-xs text-[var(--color-ink-muted)]"><span className="hidden sm:inline">Plataforma <span className="px-2 text-[var(--color-border-strong)]">/</span></span><span className="font-semibold text-[var(--color-ink)]">{section?.label ?? "Admin"}</span></p>
          </div>
          <EnvironmentBadge environment={me.environment} className="md:hidden" />
          <form role="search" aria-label="Busca global de organizações" className="flex w-full items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] pl-3 sm:w-80" onSubmit={(event) => {
            event.preventDefault();
            const query = searchRef.current?.value.trim() ?? "";
            router.push(`/organizations${query ? `?search=${encodeURIComponent(query)}` : ""}`);
          }}>
            <IconSearch className="h-4 w-4 shrink-0 text-[var(--color-ink-muted)]" />
            <input ref={searchRef} aria-label="Buscar organização" name="search" type="search" minLength={2} maxLength={100} placeholder="Organização ou titular" className="min-h-11 min-w-0 flex-1 bg-transparent text-sm outline-none" />
            <kbd aria-hidden="true" className="hidden rounded border border-[var(--color-border)] bg-white px-1.5 text-xs text-[var(--color-ink-muted)] lg:block">/</kbd>
            <button type="submit" className="min-h-11 px-3 text-xs font-semibold text-[var(--color-primary)]">Buscar</button>
          </form>
        </div>
      </header>
      <main id="admin-content" tabIndex={-1} className="px-4 py-6 outline-none sm:px-6 lg:px-9 lg:py-8"><div className="mx-auto w-full max-w-[1440px]">{children}</div></main>
    </div>
  </div>;
}
