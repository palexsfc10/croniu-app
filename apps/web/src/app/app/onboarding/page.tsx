"use client";

import { Suspense, useEffect, useState } from "react";
import { PageTitle } from "@/components/ui/page-title";
import { useRouter, useSearchParams } from "next/navigation";
import {
  apiFetch,
  type ProfessionProfile,
  type WhatsAppConsent,
} from "@/lib/api";
import {
  PROFESSION_OPTIONS,
  SPORTS_SPECIALTIES,
  TUTOR_SPECIALTIES,
  USE_CASE_OPTIONS,
  safeReturnTo,
} from "@/lib/nomenclature";
import { registerExperienceSummary } from "@/lib/capabilities";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import {
  IconCalendarPlus,
  IconCheck,
  IconSparkles,
  IconUsersRound,
  IconWhatsApp,
} from "@/components/ui/icons";

const TOTAL_STEPS = 5;

const STEP_TITLES: Record<number, string> = {
  1: "Bem-vindo",
  2: "Área de atuação",
  3: "O que você organiza",
  4: "WhatsApp (opcional)",
  5: "Primeiro passo",
};

function ProgressDots({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-hidden="true">
      {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((n) => (
        <span
          key={n}
          className={`h-1.5 flex-1 rounded-full transition-colors ${
            n <= step ? "bg-[var(--color-primary)]" : "bg-[var(--color-border)]"
          }`}
        />
      ))}
    </div>
  );
}

function OnboardingWizardInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useAuth();
  const nextPath = safeReturnTo(searchParams.get("next"));

  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [orgName, setOrgName] = useState("");

  const [code, setCode] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [other, setOther] = useState("");
  const [useCases, setUseCases] = useState<string[]>([]);

  const [whatsapp, setWhatsapp] = useState("");
  const [whatsappSaved, setWhatsappSaved] = useState<string | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);

  useEffect(() => {
    void (async () => {
      const [me, profile, contact] = await Promise.all([
        apiFetch<{ user: { full_name: string }; organization: { name: string } }>(
          "/api/v1/auth/me",
        ),
        apiFetch<ProfessionProfile>("/api/v1/organization/profession"),
        apiFetch<WhatsAppConsent>("/api/v1/users/me/whatsapp-consent"),
      ]);
      if (me.data) {
        setFullName(me.data.user.full_name);
        setOrgName(me.data.organization.name);
      }
      if (profile.data) {
        if (profile.data.profession_onboarding_done) {
          router.replace(nextPath || "/app");
          return;
        }
        setCode(profile.data.profession_code ?? "");
        setSpecialty(profile.data.profession_specialty ?? "");
        setOther(profile.data.profession_other ?? "");
        setUseCases(profile.data.use_cases ?? []);
      }
      if (contact.data) {
        setWhatsappSaved(contact.data.contact_whatsapp_e164);
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveProfession(partial: {
    profession_code?: string | null;
    profession_specialty?: string | null;
    profession_other?: string | null;
    use_cases?: string[];
    done?: boolean;
  }) {
    const result = await apiFetch<ProfessionProfile>("/api/v1/organization/profession", {
      method: "PATCH",
      body: JSON.stringify({
        profession_code: partial.profession_code,
        profession_specialty: partial.profession_specialty,
        profession_other: partial.profession_other,
        use_cases: partial.use_cases,
        profession_onboarding_done: partial.done ?? false,
      }),
    });
    return result;
  }

  async function finish(destination: string) {
    setBusy(true);
    setError(null);
    const result = await saveProfession({ done: true });
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    await refresh();
    router.push(destination);
    router.refresh();
  }

  function skipEverything() {
    void finish(nextPath || "/app");
  }

  async function continueStep2() {
    setBusy(true);
    setError(null);
    const result = await saveProfession({
      profession_code: code || null,
      profession_specialty: specialty || null,
      profession_other: other || null,
    });
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setStep(3);
  }

  async function continueStep3() {
    setBusy(true);
    setError(null);
    const result = await saveProfession({ use_cases: useCases });
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setStep(4);
  }

  async function continueStep4() {
    const trimmed = whatsapp.trim();
    if (!trimmed) {
      setStep(5);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await apiFetch<WhatsAppConsent>("/api/v1/users/me/whatsapp-consent", {
      method: "PATCH",
      body: JSON.stringify({
        contact_whatsapp_e164: trimmed,
        consent_granted: consentChecked ? true : null,
      }),
    });
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setWhatsappSaved(result.data?.contact_whatsapp_e164 ?? null);
    setStep(5);
  }

  const experience = registerExperienceSummary(code, useCases);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-2rem)] max-w-md flex-col gap-6 px-1 py-4 sm:min-h-0 sm:py-8">
      <header className="space-y-3">
        <div className="flex items-baseline justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
            Etapa {step} de {TOTAL_STEPS} · {STEP_TITLES[step]}
          </p>
          <button
            type="button"
            onClick={skipEverything}
            disabled={busy}
            className="text-xs font-semibold text-[var(--color-ink-muted)] underline-offset-2 hover:underline disabled:opacity-55"
          >
            Concluir depois
          </button>
        </div>
        <ProgressDots step={step} />
      </header>

      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}

      {step === 1 ? (
        <section className="flex flex-1 flex-col justify-center gap-4 animate-fade-up">
          <PageTitle>Bem-vindo, {fullName.split(" ")[0] || "por aqui"} 👋</PageTitle>
          <p className="text-[var(--color-ink-muted)]">
            <strong className="text-[var(--color-ink)]">{orgName}</strong> já está pronto.
            Faltam só alguns detalhes rápidos para deixar o Croniu do seu jeito — leva menos de um
            minuto, e você pode pular qualquer parte.
          </p>
          <Button fullWidth onClick={() => setStep(2)}>
            Vamos lá
          </Button>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="flex flex-1 flex-col gap-4 animate-fade-up">
          <div>
            <h2 className="h-display text-2xl text-[var(--color-ink)]">Qual é sua área?</h2>
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
              Usamos isso para adaptar termos e sugerir formulários — nunca bloqueia nada.
            </p>
          </div>
          <div className="grid gap-2">
            {PROFESSION_OPTIONS.map((opt) => (
              <label
                key={opt.code}
                className={`flex min-h-11 cursor-pointer items-center rounded-[var(--radius-md)] border px-3 text-sm ${
                  code === opt.code
                    ? "border-[var(--color-ink)] bg-[var(--color-surface-subtle)]"
                    : "border-[var(--color-border)]"
                }`}
              >
                <input
                  type="radio"
                  className="mr-2"
                  checked={code === opt.code}
                  onChange={() => {
                    setCode(opt.code);
                    setSpecialty("");
                  }}
                />
                {opt.label}
              </label>
            ))}
          </div>

          {code === "sports_teacher" ? (
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">Especialidade (opcional)</span>
              <select
                className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
              >
                <option value="">Selecionar…</option>
                {SPORTS_SPECIALTIES.map((opt) => (
                  <option key={opt.code} value={opt.code}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {code === "private_tutor" ? (
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">Área (opcional)</span>
              <select
                className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
              >
                <option value="">Selecionar…</option>
                {TUTOR_SPECIALTIES.map((opt) => (
                  <option key={opt.code} value={opt.code}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {code === "other" ? (
            <TextField
              label="Como você descreve sua atuação?"
              value={other}
              onChange={(e) => setOther(e.target.value)}
            />
          ) : null}

          <div className="mt-auto flex flex-col gap-2 pt-2">
            <Button fullWidth loading={busy} onClick={() => void continueStep2()}>
              Continuar
            </Button>
            <Button fullWidth variant="ghost" disabled={busy} onClick={() => setStep(3)}>
              Pular esta etapa
            </Button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="flex flex-1 flex-col gap-4 animate-fade-up">
          <div>
            <h2 className="h-display text-2xl text-[var(--color-ink)]">
              O que você quer organizar?
            </h2>
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
              Escolha tudo o que fizer parte da sua rotina.
            </p>
          </div>
          <div className="grid gap-2">
            {USE_CASE_OPTIONS.map((opt) => (
              <label
                key={opt.code}
                className="flex min-h-11 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-sm"
              >
                <input
                  type="checkbox"
                  checked={useCases.includes(opt.code)}
                  onChange={() =>
                    setUseCases((prev) =>
                      prev.includes(opt.code)
                        ? prev.filter((v) => v !== opt.code)
                        : [...prev, opt.code],
                    )
                  }
                />
                {opt.label}
              </label>
            ))}
          </div>

          {experience.visible ? (
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm">
              <p className="font-medium">Sua experiência no Croniu</p>
              <p className="mt-1 text-[var(--color-ink-muted)]">{experience.blurb}</p>
            </div>
          ) : null}

          <div className="mt-auto flex flex-col gap-2 pt-2">
            <Button fullWidth loading={busy} onClick={() => void continueStep3()}>
              Continuar
            </Button>
            <Button fullWidth variant="ghost" disabled={busy} onClick={() => setStep(4)}>
              Pular esta etapa
            </Button>
          </div>
        </section>
      ) : null}

      {step === 4 ? (
        <section className="flex flex-1 flex-col gap-4 animate-fade-up">
          <div className="flex items-center gap-2">
            <IconWhatsApp className="h-6 w-6 text-[var(--color-success)]" />
            <h2 className="h-display text-2xl text-[var(--color-ink)]">Seu WhatsApp</h2>
          </div>
          <p className="text-sm text-[var(--color-ink-muted)]">
            Totalmente opcional. Usamos para falar com você sobre onboarding, suporte, o período
            de teste e ofertas — nunca para outra finalidade, e nunca para clientes ou terceiros.
          </p>
          <TextField
            label="WhatsApp"
            placeholder="(11) 99999-0000"
            inputMode="tel"
            autoComplete="tel"
            hint={
              whatsappSaved
                ? `Salvo atualmente: +${whatsappSaved}. Você pode alterar ou remover quando quiser em Minha conta.`
                : "Fora do Brasil? Inclua o código do seu país (ex.: +44 7911 123456)."
            }
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
          />
          <label className="flex items-start gap-2 text-sm text-[var(--color-ink)]">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={consentChecked}
              onChange={(e) => setConsentChecked(e.target.checked)}
            />
            <span>
              Autorizo o Croniu a me contatar por esse WhatsApp sobre onboarding, suporte, o
              período de teste e ofertas. Posso revogar quando quiser em Minha conta.
            </span>
          </label>

          <div className="mt-auto flex flex-col gap-2 pt-2">
            <Button fullWidth loading={busy} onClick={() => void continueStep4()}>
              {whatsapp.trim() ? "Continuar" : "Pular esta etapa"}
            </Button>
          </div>
        </section>
      ) : null}

      {step === 5 ? (
        <section className="flex flex-1 flex-col gap-4 animate-fade-up">
          <div>
            <h2 className="h-display text-2xl text-[var(--color-ink)]">Por onde começar?</h2>
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
              Escolha o primeiro passo — o resto do Croniu continua disponível a qualquer momento.
            </p>
          </div>
          <div className="grid gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void finish("/app/clients/new")}
              className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left transition-colors hover:border-[var(--color-ink)] disabled:opacity-55"
            >
              <IconUsersRound className="h-6 w-6 shrink-0 text-[var(--color-primary)]" />
              <span>
                <span className="block font-semibold text-[var(--color-ink)]">
                  Cadastrar um cliente
                </span>
                <span className="block text-sm text-[var(--color-ink-muted)]">
                  Comece com quem você já atende.
                </span>
              </span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void finish("/app/services/new")}
              className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left transition-colors hover:border-[var(--color-ink)] disabled:opacity-55"
            >
              <IconCalendarPlus className="h-6 w-6 shrink-0 text-[var(--color-primary)]" />
              <span>
                <span className="block font-semibold text-[var(--color-ink)]">
                  Configurar um serviço
                </span>
                <span className="block text-sm text-[var(--color-ink-muted)]">
                  Defina o que você oferece e o valor.
                </span>
              </span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void finish("/app/assistant")}
              className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left transition-colors hover:border-[var(--color-ink)] disabled:opacity-55"
            >
              <IconSparkles className="h-6 w-6 shrink-0 text-[var(--color-primary)]" />
              <span>
                <span className="block font-semibold text-[var(--color-ink)]">
                  Explorar com a IA
                </span>
                <span className="block text-sm text-[var(--color-ink-muted)]">
                  Pergunte o que o Croniu pode fazer por você.
                </span>
              </span>
            </button>
          </div>
          <Button
            fullWidth
            variant="ghost"
            loading={busy}
            onClick={() => void finish(nextPath || "/app")}
          >
            <IconCheck className="h-4 w-4" />
            Ir para o início
          </Button>
        </section>
      ) : null}
    </div>
  );
}

export default function OnboardingWizardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p>
        </div>
      }
    >
      <OnboardingWizardInner />
    </Suspense>
  );
}
