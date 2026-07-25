"use client";

import Link from "next/link";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";

export default function ProfilePage() {
  const { me, logout } = useAuth();

  if (!me) return null;

  return (
    <div className="space-y-4 animate-fade-up">
      <div>
        <h1 className="h-display text-3xl text-[var(--color-ink)]">Mais</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">Conta, preferências e cadastros.</p>
      </div>
      <dl className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div>
          <dt className="text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">Nome</dt>
          <dd className="text-base font-medium">{me.user.full_name}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">E-mail</dt>
          <dd className="text-base font-medium">{me.user.email}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">Organização</dt>
          <dd className="text-base font-medium">{me.organization.name}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">Papel</dt>
          <dd className="text-base font-medium">{me.role}</dd>
        </div>
      </dl>
      <div className="space-y-2">
        <Link
          href="/app/services"
          className="block rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3 font-semibold text-[var(--color-primary)]"
        >
          Serviços
        </Link>
        <Link
          href="/app/cycle-templates"
          className="block rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3 font-semibold text-[var(--color-primary)]"
        >
          Modelos de ciclo
        </Link>
        <Link
          href="/app/locations"
          className="block rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3 font-semibold text-[var(--color-primary)]"
        >
          Locais
        </Link>
        <Link
          href="/app/preferences"
          className="block rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3 font-semibold text-[var(--color-primary)]"
        >
          Preferências (fuso horário)
        </Link>
      </div>
      <Button variant="secondary" fullWidth onClick={() => void logout()}>
        Sair
      </Button>
    </div>
  );
}
