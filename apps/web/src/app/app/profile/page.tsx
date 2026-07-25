"use client";

import Link from "next/link";
import { useAuth } from "@/components/auth/auth-provider";

export default function ProfilePage() {
  const { me } = useAuth();

  if (!me) return null;

  return (
    <div className="space-y-4 animate-fade-up">
      <div>
        <h1 className="h-display text-3xl text-[var(--color-ink)]">Perfil</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">Dados básicos da sua conta.</p>
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
      <Link
        href="/app/services"
        className="block rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3 font-semibold text-[var(--color-primary)]"
      >
        Serviços e planos
      </Link>
    </div>
  );
}
