"use client";

import Link from "next/link";
import { useAuth } from "@/components/auth/auth-provider";
import {
  IconBriefcase,
  IconClock,
  IconCreditCard,
  IconLifeBuoy,
  IconLogOut,
  IconUser,
} from "@/components/ui/icons";
import { PageTitle } from "@/components/ui/page-title";
import { Button } from "@/components/ui/button";

const ROWS: {
  href: string;
  title: string;
  description: string;
  Icon: typeof IconUser;
}[] = [
  {
    href: "/app/settings/account",
    title: "Minha conta",
    description: "Nome, e-mail, WhatsApp de contato e consentimento.",
    Icon: IconUser,
  },
  {
    href: "/app/settings/workspace",
    title: "Workspace",
    description: "Perfil profissional, fuso horário, jornada e recebimentos.",
    Icon: IconBriefcase,
  },
  {
    href: "/app/settings/workspace#disponibilidade",
    title: "Disponibilidade",
    description: "Sua jornada semanal de atendimento.",
    Icon: IconClock,
  },
  {
    href: "/app/settings/billing",
    title: "Plano e assinatura",
    description: "Situação da sua assinatura no Croniu.",
    Icon: IconCreditCard,
  },
  {
    href: "/app/settings/help",
    title: "Ajuda e privacidade",
    description: "Manual, feedback, Termos e Política de Privacidade.",
    Icon: IconLifeBuoy,
  },
];

export default function SettingsHubPage() {
  const { me, logout } = useAuth();

  return (
    <div className="mx-auto max-w-lg animate-fade-up">
      <header className="mb-5">
        <PageTitle>Conta e configurações</PageTitle>
        {me ? (
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            {me.user.full_name} · {me.organization.name}
          </p>
        ) : null}
      </header>
      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)]/80 bg-[var(--color-surface)]">
        {ROWS.map((row) => (
          <Link
            key={row.href}
            href={row.href}
            className="flex min-h-14 items-center gap-3 border-b border-[var(--color-border)]/60 px-4 py-3 last:border-b-0 hover:bg-[var(--color-surface-subtle)]"
          >
            <span className="icon-tile icon-tile-primary h-10 w-10">
              <row.Icon className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--color-ink)]">{row.title}</p>
              <p className="truncate text-xs text-[var(--color-ink-muted)]">{row.description}</p>
            </div>
          </Link>
        ))}
      </div>
      <Button
        variant="outline-danger"
        fullWidth
        className="mt-4"
        onClick={() => void logout()}
      >
        <IconLogOut className="h-4 w-4" aria-hidden />
        Sair
      </Button>
    </div>
  );
}
