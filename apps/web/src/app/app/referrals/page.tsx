"use client";

import { useEffect, useState } from "react";
import { BackLink } from "@/components/app/back-link";
import { Button } from "@/components/ui/button";
import { IconCopy, IconWhatsApp } from "@/components/ui/icons";
import { apiFetch, type MyReferral } from "@/lib/api";

export default function ReferralsPage() {
  const [referral, setReferral] = useState<MyReferral | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const result = await apiFetch<MyReferral>("/api/v1/referrals/me");
      if (cancelled) return;
      setReferral(result.data ?? null);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function copyLink() {
    if (!referral?.link) return;
    try {
      await navigator.clipboard.writeText(referral.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable — link stays visible on the page.
    }
  }

  if (loading) {
    return <p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p>;
  }

  if (!referral?.enabled) {
    return (
      <div className="mx-auto max-w-lg space-y-4 animate-fade-up">
        <BackLink href="/app" label="Hoje" />
        <p className="text-sm text-[var(--color-ink-muted)]">
          Esta página está disponível apenas para divulgadores habilitados.
        </p>
      </div>
    );
  }

  const whatsappText = encodeURIComponent(
    `Indique o Croniu! Quem se cadastrar pelo meu link recebe ${referral.discount_percent ?? 10}% de desconto enquanto mantiver a assinatura: ${referral.link}`,
  );

  return (
    <div className="mx-auto max-w-lg space-y-4 animate-fade-up">
      <BackLink href="/app" label="Hoje" />
      <div>
        <h1 className="h-display text-3xl text-[var(--color-ink)]">Indique o Croniu</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Indique o Croniu. Quem se cadastrar pelo seu link recebe {referral.discount_percent ?? 10}%
          de desconto enquanto mantiver a assinatura.
        </p>
      </div>

      <section className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
            Seu código
          </p>
          <p className="mt-1 font-mono text-lg font-semibold text-[var(--color-ink)]">
            {referral.code}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
            Desconto oferecido
          </p>
          <p className="mt-1 text-sm text-[var(--color-ink)]">{referral.discount_percent ?? 10}%</p>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
            Seu link
          </p>
          <p className="mt-1 truncate text-sm text-[var(--color-ink)]">{referral.link}</p>
        </div>
      </section>

      <div className="space-y-2">
        <Button fullWidth onClick={() => void copyLink()}>
          <IconCopy className="mr-2 h-4 w-4" aria-hidden />
          {copied ? "Link copiado!" : "Copiar link"}
        </Button>
        <a
          href={`https://wa.me/?text=${whatsappText}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block"
        >
          <Button fullWidth variant="secondary">
            <IconWhatsApp className="mr-2 h-4 w-4" aria-hidden />
            Compartilhar no WhatsApp
          </Button>
        </a>
      </div>
    </div>
  );
}
