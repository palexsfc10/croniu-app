"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconBriefcase,
  IconCreditCard,
  IconLifeBuoy,
  IconUser,
} from "@/components/ui/icons";

const SECTIONS = [
  { href: "/app/settings/account", label: "Minha conta", Icon: IconUser },
  { href: "/app/settings/workspace", label: "Workspace", Icon: IconBriefcase },
  { href: "/app/settings/billing", label: "Plano e assinatura", Icon: IconCreditCard },
  { href: "/app/settings/help", label: "Ajuda e privacidade", Icon: IconLifeBuoy },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="mx-auto flex w-full max-w-5xl gap-8">
      <aside className="hidden w-52 shrink-0 md:block">
        <div className="sticky top-20 space-y-4">
          <div>
            <h1 className="h-display text-2xl text-[var(--color-ink)]">Conta e configurações</h1>
          </div>
          <nav aria-label="Seções de configurações" className="flex flex-col gap-1">
            {SECTIONS.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const { Icon } = item;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={[
                    "flex min-h-10 items-center gap-2.5 rounded-[var(--radius-md)] px-3 py-2 text-sm font-semibold transition-colors",
                    active
                      ? "bg-[var(--color-primary-subtle)] text-[var(--color-primary)]"
                      : "text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-ink)]",
                  ].join(" ")}
                >
                  <Icon className="h-4 w-4 opacity-90" aria-hidden />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
