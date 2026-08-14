"use client";

import Link from "next/link";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/auth-provider";

const SESSION_KEY = "croniu.profession-nudge.dismissed";

export function ProfessionNudge() {
  const { me } = useAuth();
  const org = me?.organization;
  const [hidden, setHidden] = useState(() => {
    if (typeof window === "undefined") return true;
    return sessionStorage.getItem(SESSION_KEY) === "1";
  });

  if (hidden || !org) return null;
  if (org.profession_code || org.profession_onboarding_done) return null;

  async function dismiss() {
    sessionStorage.setItem(SESSION_KEY, "1");
    setHidden(true);
    await apiFetch("/api/v1/organization/profession", {
      method: "PATCH",
      body: JSON.stringify({ profession_onboarding_done: true }),
    });
  }

  return (
    <section
      aria-label="Adaptar experiência"
      className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
    >
      <p className="text-sm font-semibold text-[var(--color-ink)]">
        Ajude o Croniu a adaptar sua experiência
      </p>
      <p className="mt-1 text-sm text-[var(--color-ink-muted)]">Qual é sua área de atuação?</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href="/app/profile/professional">
          <Button>Completar agora</Button>
        </Link>
        <Button variant="ghost" onClick={() => void dismiss()}>
          Fazer depois
        </Button>
      </div>
    </section>
  );
}
