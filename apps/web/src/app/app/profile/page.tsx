"use client";

import { SettingsGroup, SettingsRow } from "@/components/app/settings-list";
import { PageTitle } from "@/components/ui/page-title";
import { InstallCroniuRow } from "@/components/pwa/install-croniu-row";
import Link from "next/link";
import {
  IconClipboardList,
  IconLayers,
  IconLifeBuoy,
  IconMapPin,
  IconUser,
} from "@/components/ui/icons";
import type { ComponentType, SVGProps } from "react";

type IconType = ComponentType<SVGProps<SVGSVGElement> & { title?: string }>;

/** Grid card for the low-frequency tools that live here — Serviços, Ciclos
 * e renovações, Rotinas and Acompanhamentos moved to the sidebar itself
 * (they're daily-use, not occasional), so this page no longer duplicates
 * them. What's left genuinely belongs in a "everything else" hub: tonal
 * icon, title, one line of context — a grid, not another stacked list. */
function ToolCard({
  href,
  title,
  description,
  Icon,
  tone = "primary",
}: {
  href: string;
  title: string;
  description: string;
  Icon: IconType;
  tone?: "primary" | "ai";
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)]/80 bg-[var(--color-surface)] p-4 transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-subtle)]"
    >
      <span
        className={[
          "flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)]",
          tone === "ai"
            ? "bg-[var(--color-ai-subtle)] text-[var(--color-ai)]"
            : "bg-[var(--color-primary-subtle)] text-[var(--color-primary)]",
        ].join(" ")}
        aria-hidden
      >
        <Icon className="h-5 w-5" />
      </span>
      <span>
        <span className="block text-sm font-semibold text-[var(--color-ink)]">{title}</span>
        <span className="mt-0.5 block text-xs leading-snug text-[var(--color-ink-muted)]">
          {description}
        </span>
      </span>
    </Link>
  );
}

export default function MorePage() {
  return (
    <div className="mx-auto w-full max-w-[1180px] space-y-6 animate-fade-up">
      <header className="space-y-1">
        <PageTitle>Mais</PageTitle>
        <p className="text-sm text-[var(--color-ink-muted)]">
          Configure como o Croniu funciona para você.
        </p>
      </header>

      <SettingsGroup title="Conta e configurações">
        <SettingsRow
          href="/app/settings"
          title="Conta e configurações"
          description="Minha conta, Workspace, plano e assinatura, ajuda e privacidade."
          Icon={IconUser}
        />
      </SettingsGroup>

      <section className="space-y-2">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-[0.06em] text-[var(--color-ink-muted)]">
          Ferramentas
        </h2>
        {/* 2 columns, not 3 — with exactly 4 real tools today, 3 columns
            left the 4th card alone in its own row, flanked by two empty
            slots. 2 columns divides evenly (2×2) with the tools that
            exist now; the day a 5th/6th genuine tool shows up here,
            revisit before defaulting back to 3. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <ToolCard
            href="/app/cycle-templates"
            title="Modelos de ciclo"
            description="Frequência e período reutilizáveis."
            Icon={IconLayers}
          />
          <ToolCard
            href="/app/locations"
            title="Locais de atendimento"
            description="Onde você atende seus clientes."
            Icon={IconMapPin}
          />
          <ToolCard
            href="/app/setup"
            title="Configuração inicial"
            description="Serviço e modelo mínimos para começar."
            Icon={IconClipboardList}
          />
          <ToolCard
            href="/app/manual"
            title="Manual"
            description="Como o Croniu funciona hoje."
            Icon={IconLifeBuoy}
            tone="ai"
          />
        </div>
      </section>

      <div id="instalar-croniu" className="scroll-mt-20">
        <SettingsGroup title="Aplicativo">
          <InstallCroniuRow />
        </SettingsGroup>
      </div>
    </div>
  );
}
