"use client";

import { BackLink } from "@/components/app/back-link";
import { useAuth } from "@/components/auth/auth-provider";
import { formatMembershipRole } from "@/lib/role-label";

export default function AccountPage() {
  const { me } = useAuth();
  if (!me) return null;

  const rows = [
    { label: "Nome", value: me.user.full_name },
    { label: "E-mail da conta", value: me.user.email },
    { label: "Organização", value: me.organization.name },
    { label: "Função", value: formatMembershipRole(me.role) },
  ];

  return (
    <div className="mx-auto max-w-lg space-y-5 animate-fade-up">
      <BackLink href="/app/profile" label="Mais" />
      <div>
        <h1 className="h-display text-3xl text-[var(--color-ink)]">Minha conta</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Dados da sua conta no Croniu.
        </p>
      </div>
      <dl className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)]/80 bg-[var(--color-surface)]">
        {rows.map((row) => (
          <div
            key={row.label}
            className="grid gap-0.5 border-b border-[var(--color-border)]/60 px-3.5 py-3 last:border-b-0 sm:grid-cols-[8rem_1fr] sm:items-baseline sm:gap-3"
          >
            <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
              {row.label}
            </dt>
            <dd className="text-sm font-medium text-[var(--color-ink)] break-words">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
