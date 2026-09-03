"use client";

import { useEffect, useState } from "react";
import { BackLink } from "@/components/app/back-link";
import { useAuth } from "@/components/auth/auth-provider";
import { formatMembershipRole } from "@/lib/role-label";
import { apiFetch, type WhatsAppConsent } from "@/lib/api";
import { readVoiceAutoSend, writeVoiceAutoSend } from "@/lib/assistant-prefs";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { IconWhatsApp } from "@/components/ui/icons";

function formatConsentDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function WhatsAppSection() {
  const { me, refresh } = useAuth();
  const saved = me?.user.contact_whatsapp_e164 ?? null;
  const consentAt = me?.user.whatsapp_marketing_consent_at ?? null;
  const [value, setValue] = useState(saved ?? "");
  const [consentChecked, setConsentChecked] = useState(Boolean(consentAt));
  const [busy, setBusy] = useState<"save" | "revoke" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>) {
    const result = await apiFetch<WhatsAppConsent>("/api/v1/users/me/whatsapp-consent", {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    if (result.error) {
      setError(result.error.message);
      return false;
    }
    await refresh();
    return true;
  }

  async function save() {
    setBusy("save");
    setError(null);
    setInfo(null);
    const trimmed = value.trim();
    const ok = await patch({
      contact_whatsapp_e164: trimmed || null,
      consent_granted: trimmed ? consentChecked : null,
    });
    setBusy(null);
    if (ok) setInfo("WhatsApp atualizado.");
  }

  async function revokeConsent() {
    setBusy("revoke");
    setError(null);
    setInfo(null);
    const ok = await patch({ consent_granted: false });
    setBusy(null);
    if (ok) {
      setConsentChecked(false);
      setInfo("Consentimento revogado. O número continua salvo, mas não usamos mais para contato comercial.");
    }
  }

  async function removeNumber() {
    setBusy("remove");
    setError(null);
    setInfo(null);
    const ok = await patch({ contact_whatsapp_e164: "" });
    setBusy(null);
    if (ok) {
      setValue("");
      setConsentChecked(false);
      setInfo("WhatsApp removido.");
    }
  }

  return (
    <div className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--color-border)]/80 bg-[var(--color-surface)] p-4">
      <div className="flex items-center gap-2">
        <IconWhatsApp className="h-5 w-5 text-[var(--color-success)]" />
        <h2 className="text-sm font-semibold text-[var(--color-ink)]">Seu WhatsApp</h2>
      </div>
      <p className="text-sm text-[var(--color-ink-muted)]">
        Totalmente opcional. Usamos para falar com você sobre onboarding, suporte, o período de
        teste e ofertas — nunca para outra finalidade, e nunca para clientes ou terceiros.
      </p>

      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
      {info ? (
        <p role="status" className="text-sm text-[var(--color-success)]">
          {info}
        </p>
      ) : null}

      <TextField
        label="Número"
        placeholder="(11) 99999-0000"
        inputMode="tel"
        autoComplete="tel"
        hint="Fora do Brasil? Inclua o código do seu país (ex.: +44 7911 123456)."
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />

      <label className="flex items-start gap-2 text-sm text-[var(--color-ink)]">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={consentChecked}
          onChange={(e) => setConsentChecked(e.target.checked)}
        />
        <span>
          Autorizo o Croniu a me contatar por esse WhatsApp sobre onboarding, suporte, o período
          de teste e ofertas.
        </span>
      </label>

      <p className="text-xs text-[var(--color-ink-muted)]">
        {consentAt
          ? `Consentimento ativo desde ${formatConsentDate(consentAt)}.`
          : "Sem consentimento ativo hoje — não entramos em contato comercial por WhatsApp."}
      </p>

      <div className="flex flex-wrap gap-2 pt-1">
        <Button size="sm" loading={busy === "save"} disabled={busy !== null} onClick={() => void save()}>
          Salvar
        </Button>
        {consentAt ? (
          <Button
            size="sm"
            variant="outline"
            loading={busy === "revoke"}
            disabled={busy !== null}
            onClick={() => void revokeConsent()}
          >
            Revogar consentimento
          </Button>
        ) : null}
        {saved ? (
          <Button
            size="sm"
            variant="ghost"
            loading={busy === "remove"}
            disabled={busy !== null}
            onClick={() => void removeNumber()}
          >
            Remover número
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function AssistantPreferencesSection() {
  const [voiceAutoSend, setVoiceAutoSend] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from localStorage on mount
    setVoiceAutoSend(readVoiceAutoSend());
  }, []);

  return (
    <section className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--color-border)]/80 bg-[var(--color-surface)] p-4">
      <h2 className="text-sm font-semibold text-[var(--color-ink)]">Assistente</h2>
      <p className="text-sm text-[var(--color-ink-muted)]">
        Preferência local deste dispositivo — não é salva no servidor.
      </p>
      <label className="flex min-h-11 items-center gap-3 text-sm text-[var(--color-ink)]">
        <input
          type="checkbox"
          checked={voiceAutoSend}
          onChange={(e) => {
            const next = e.target.checked;
            setVoiceAutoSend(next);
            writeVoiceAutoSend(next);
          }}
          aria-describedby="voice-auto-send-help"
        />
        Enviar voz automaticamente após a transcrição
      </label>
      <p id="voice-auto-send-help" className="text-xs text-[var(--color-ink-subtle)]">
        Quando ligado, o áudio transcrito é enviado ao assistente sem passo extra. Também
        disponível no menu do microfone (toque prolongado / botão direito).
      </p>
    </section>
  );
}

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
      <BackLink href="/app/settings" label="Conta e configurações" />
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
      <WhatsAppSection />
      <AssistantPreferencesSection />
    </div>
  );
}
