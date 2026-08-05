"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function TrialExpiredPage() {
  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-lg flex-col justify-center gap-4 px-4 py-8">
      <h1 className="h-display text-3xl text-[var(--color-ink)]">Seu período de teste acabou</h1>
      <p className="text-sm text-[var(--color-ink-muted)]">
        Para continuar usando o Croniu com sua organização, ative a assinatura mensal. Seus dados
        permanecem preservados.
      </p>
      <Link href="/app/billing">
        <Button fullWidth>Ver planos e assinar</Button>
      </Link>
      <Link href="/app/profile" className="text-center text-sm font-semibold text-[var(--color-link)]">
        Conta
      </Link>
    </div>
  );
}
