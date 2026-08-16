"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  IntakeSubmitResult,
  PublicIntakeContext,
} from "@/lib/api";
import { BrandWordmark } from "@/components/brand/brand-wordmark";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/text-area";
import { TextField } from "@/components/ui/text-field";
import { QuestionField } from "@/components/intake/question-field";
import {
  ageProofValid,
  anamnesisQuestionSections,
  clearNamePhoneDraft,
  consentsFromSchema,
  flattenVisibleQuestions,
  hasAttentionAnswers,
  intakeSteps,
  isQuestionVisible,
  loadNamePhoneDraft,
  missingRequiredQuestions,
  requiredConsentsAccepted,
  saveNamePhoneDraft,
  type IntakeStepId,
} from "@/lib/intake";

type Identity = {
  full_name: string;
  phone: string;
  email: string;
  birth_date: string;
  age_band_18: boolean;
  primary_goal: string;
  occupation: string;
  emergency_contact: string;
  initial_notes: string;
};

const EMPTY_IDENTITY: Identity = {
  full_name: "",
  phone: "",
  email: "",
  birth_date: "",
  age_band_18: false,
  primary_goal: "",
  occupation: "",
  emergency_contact: "",
  initial_notes: "",
};

function parsePublicError(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const data = body as {
    message?: string;
    detail?: string | { message?: string };
  };
  if (typeof data.message === "string" && data.message.trim()) return data.message;
  if (typeof data.detail === "string" && data.detail.trim()) return data.detail;
  if (data.detail && typeof data.detail === "object" && data.detail.message) {
    return data.detail.message;
  }
  return fallback;
}

export default function PublicIntakePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  // Generate once on first submit (not during render) to satisfy react-hooks/purity.
  const idempotencyKey = useRef<string | null>(null);
  function ensureIdempotencyKey(): string {
    if (!idempotencyKey.current) {
      idempotencyKey.current =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `intake-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    }
    return idempotencyKey.current;
  }

  const [ctx, setCtx] = useState<PublicIntakeContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<IntakeStepId>("welcome");
  const [identity, setIdentity] = useState<Identity>(EMPTY_IDENTITY);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [consents, setConsents] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<IntakeSubmitResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setError(null);
      const res = await fetch(`/api/v1/public/intake/${token}`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const body = await res.json().catch(() => null);
      if (cancelled) return;
      if (!res.ok) {
        setError(parsePublicError(body, "Este link não está disponível."));
        setCtx(null);
        return;
      }
      setCtx(body as PublicIntakeContext);
      const draft = loadNamePhoneDraft(token);
      if (draft.full_name || draft.phone) {
        setIdentity((prev) => ({
          ...prev,
          full_name: draft.full_name ?? prev.full_name,
          phone: draft.phone ?? prev.phone,
        }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const consentDefs = useMemo(() => consentsFromSchema(ctx?.anamnesis_schema), [ctx]);
  const formNoun =
    ctx?.form_name || ctx?.nomenclature?.intake_form || "cadastro";
  const steps = useMemo(() => intakeSteps(ctx?.form_name), [ctx?.form_name]);
  const questionSections = useMemo(
    () => anamnesisQuestionSections(ctx?.anamnesis_schema),
    [ctx],
  );
  const attentionNow = useMemo(
    () => hasAttentionAnswers(answers, ctx?.anamnesis_schema),
    [answers, ctx],
  );

  const stepIndex = steps.findIndex((s) => s.id === step);

  function patchIdentity<K extends keyof Identity>(key: K, value: Identity[K]) {
    setIdentity((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "full_name" || key === "phone") {
        saveNamePhoneDraft(token, { full_name: next.full_name, phone: next.phone });
      }
      return next;
    });
  }

  function validateIdentity(): string | null {
    if (!identity.full_name.trim()) return "Informe seu nome completo.";
    if (identity.phone.replace(/\D/g, "").length < 8) return "Informe um telefone válido.";
    if (!identity.primary_goal.trim()) return "Informe seu objetivo principal.";
    if (!ageProofValid({ birthDate: identity.birth_date, ageBand18Plus: identity.age_band_18 })) {
      return "Informe a data de nascimento (18+) ou confirme que tem 18 anos ou mais.";
    }
    return null;
  }

  function goAnamnese() {
    const msg = validateIdentity();
    if (msg) {
      setError(msg);
      return;
    }
    setError(null);
    setStep("anamnese");
  }

  function goConsents() {
    const missing = missingRequiredQuestions(answers, ctx?.anamnesis_schema);
    if (missing.length) {
      setError(`Responda as perguntas obrigatórias do ${formNoun.toLowerCase()}.`);
      return;
    }
    setError(null);
    setStep("consentimentos");
  }

  function goReview() {
    if (!requiredConsentsAccepted(consents, ctx?.anamnesis_schema)) {
      setError("Aceite todos os consentimentos obrigatórios para continuar.");
      return;
    }
    setError(null);
    setStep("revisao");
  }

  async function submit() {
    const msg = validateIdentity();
    if (msg) {
      setError(msg);
      setStep("identificacao");
      return;
    }
    if (missingRequiredQuestions(answers, ctx?.anamnesis_schema).length) {
      setError(`Responda as perguntas obrigatórias do ${formNoun.toLowerCase()}.`);
      setStep("anamnese");
      return;
    }
    if (!requiredConsentsAccepted(consents, ctx?.anamnesis_schema)) {
      setError("Aceite os consentimentos obrigatórios.");
      setStep("consentimentos");
      return;
    }

    setBusy(true);
    setError(null);
    const key = ensureIdempotencyKey();
    const visible = flattenVisibleQuestions(ctx?.anamnesis_schema, answers);
    const payloadAnswers: Record<string, unknown> = {};
    for (const q of visible) {
      const val = answers[q.id];
      if (val == null || val === "" || (Array.isArray(val) && val.length === 0)) continue;
      payloadAnswers[q.id] = val;
    }
    if (!payloadAnswers.a_primary_goal && identity.primary_goal.trim()) {
      payloadAnswers.a_primary_goal = identity.primary_goal.trim();
    }

    const res = await fetch(`/api/v1/public/intake/${token}/submit`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      body: JSON.stringify({
        full_name: identity.full_name.trim(),
        phone: identity.phone.trim(),
        email: identity.email.trim() || null,
        birth_date: identity.birth_date.trim() || null,
        age_band: identity.birth_date.trim() ? null : "18+",
        primary_goal: identity.primary_goal.trim(),
        occupation: identity.occupation.trim() || null,
        emergency_contact: identity.emergency_contact.trim() || null,
        initial_notes: identity.initial_notes.trim() || null,
        answers: payloadAnswers,
        consents,
        idempotency_key: key,
      }),
    });
    const body = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setError(parsePublicError(body, "Não foi possível enviar o cadastro."));
      return;
    }
    clearNamePhoneDraft(token);
    setResult(body as IntakeSubmitResult);
    setStep("enviado");
  }

  return (
    <div className="min-h-dvh bg-[var(--color-bg)]">
      <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-6">
        <header className="mb-6 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-[var(--color-ink-muted)]">Cadastro</p>
            {ctx ? (
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--color-ink)]">
                {ctx.form_name || ctx.professional_public_name}
              </h1>
            ) : (
              <h1 className="mt-1 text-2xl text-[var(--color-ink)]">Bem-vindo</h1>
            )}
          </div>
          <BrandWordmark size="md" />
        </header>

        {step !== "welcome" && step !== "enviado" && stepIndex >= 0 ? (
          <nav aria-label="Etapas" className="mb-4">
            <ol className="flex gap-1">
              {steps.map((s, i) => (
                <li
                  key={s.id}
                  className={[
                    "h-1.5 flex-1 rounded-full",
                    i <= stepIndex
                      ? "bg-[var(--color-primary)]"
                      : "bg-[var(--color-border)]",
                  ].join(" ")}
                  title={s.label}
                />
              ))}
            </ol>
            <p className="mt-2 text-xs font-medium text-[var(--color-ink-muted)]">
              {steps[stepIndex]?.label}
            </p>
          </nav>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="mb-3 rounded-[var(--radius-md)] border border-[var(--color-danger)]/25 bg-[var(--color-danger-subtle)] px-4 py-3 text-sm text-[var(--color-danger)]"
          >
            {error}
          </p>
        ) : null}

        {!ctx && !error ? (
          <p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p>
        ) : null}

        {ctx && step === "welcome" ? (
          <div className="space-y-5">
            <p className="text-base leading-relaxed text-[var(--color-ink)]">
              {ctx.welcome_message}
            </p>
            <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <h2 className="text-sm font-semibold text-[var(--color-ink)]">Como funciona</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-ink-muted)]">
                {ctx.process_summary}
              </p>
            </section>
            <Button fullWidth onClick={() => setStep("identificacao")}>
              Começar
            </Button>
          </div>
        ) : null}

        {ctx && step === "identificacao" ? (
          <div className="space-y-4">
            <TextField
              label="Nome completo *"
              autoComplete="name"
              value={identity.full_name}
              onChange={(e) => patchIdentity("full_name", e.target.value)}
            />
            <TextField
              label="Telefone / WhatsApp *"
              autoComplete="tel"
              inputMode="tel"
              value={identity.phone}
              onChange={(e) => patchIdentity("phone", e.target.value)}
            />
            <TextField
              label="E-mail"
              type="email"
              autoComplete="email"
              value={identity.email}
              onChange={(e) => patchIdentity("email", e.target.value)}
            />
            <TextArea
              label="Objetivo principal *"
              value={identity.primary_goal}
              onChange={(e) => patchIdentity("primary_goal", e.target.value)}
              rows={2}
            />
            <TextField
              label="Data de nascimento"
              type="date"
              value={identity.birth_date}
              onChange={(e) => {
                patchIdentity("birth_date", e.target.value);
                if (e.target.value) patchIdentity("age_band_18", false);
              }}
            />
            <label className="flex min-h-11 items-start gap-2 text-sm text-[var(--color-ink)]">
              <input
                type="checkbox"
                className="mt-1 accent-[var(--color-primary)]"
                checked={identity.age_band_18}
                disabled={Boolean(identity.birth_date)}
                onChange={(e) => patchIdentity("age_band_18", e.target.checked)}
              />
              Confirmo que tenho 18 anos ou mais (se não informar a data de nascimento)
            </label>
            <TextField
              label="Ocupação"
              value={identity.occupation}
              onChange={(e) => patchIdentity("occupation", e.target.value)}
            />
            <TextField
              label="Contato de emergência"
              value={identity.emergency_contact}
              onChange={(e) => patchIdentity("emergency_contact", e.target.value)}
            />
            <TextArea
              label="Observações iniciais"
              value={identity.initial_notes}
              onChange={(e) => patchIdentity("initial_notes", e.target.value)}
              rows={2}
            />
            <div className="flex flex-col gap-2 pt-2">
              <Button fullWidth onClick={goAnamnese}>
                Continuar
              </Button>
              <Button fullWidth variant="ghost" onClick={() => setStep("welcome")}>
                Voltar
              </Button>
            </div>
          </div>
        ) : null}

        {ctx && step === "anamnese" ? (
          <div className="space-y-6">
            {attentionNow ? (
              <p
                role="status"
                className="rounded-[var(--radius-md)] border border-[var(--color-warning)]/25 bg-[var(--color-warning-subtle)] px-3 py-3 text-sm text-[var(--color-ink)]"
              >
                {ctx.attention_client_message}
              </p>
            ) : null}
            {questionSections.map((section) => (
              <section key={section.id} className="space-y-3">
                <h2 className="text-base font-semibold text-[var(--color-ink)]">
                  {section.title}
                </h2>
                {(section.questions ?? [])
                  .filter((q) => isQuestionVisible(q, answers))
                  .map((q) => (
                  <QuestionField
                    key={q.id}
                    question={q}
                    value={answers[q.id] ?? ""}
                    onChange={(next) =>
                      setAnswers((prev) => ({ ...prev, [q.id]: next }))
                    }
                  />
                ))}
              </section>
            ))}
            <div className="flex flex-col gap-2 pt-2">
              <Button fullWidth onClick={goConsents}>
                Continuar
              </Button>
              <Button fullWidth variant="ghost" onClick={() => setStep("identificacao")}>
                Voltar
              </Button>
            </div>
          </div>
        ) : null}

        {ctx && step === "consentimentos" ? (
          <div className="space-y-4">
            <p className="text-sm text-[var(--color-ink-muted)]">
              Leia e marque cada declaração. Os itens obrigatórios precisam ser aceitos.
            </p>
            <p className="text-sm text-[var(--color-ink-muted)]">
              Consentimentos obrigatórios
            </p>
            <ul className="space-y-2">
              {consentDefs.filter((c) => c.required).map((c) => (
                <li key={c.key}>
                  <label className="flex min-h-11 items-start gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3 text-sm text-[var(--color-ink)]">
                    <input
                      type="checkbox"
                      className="mt-0.5 accent-[var(--color-primary)]"
                      checked={Boolean(consents[c.key])}
                      onChange={(e) =>
                        setConsents((prev) => ({ ...prev, [c.key]: e.target.checked }))
                      }
                    />
                    <span>{c.label}</span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="pt-2 text-sm text-[var(--color-ink-muted)]">Preferências opcionais</p>
            <ul className="space-y-2">
              {consentDefs.filter((c) => !c.required).map((c) => (
                <li key={c.key}>
                  <label className="flex min-h-11 items-start gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3 text-sm text-[var(--color-ink)]">
                    <input
                      type="checkbox"
                      className="mt-0.5 accent-[var(--color-primary)]"
                      checked={Boolean(consents[c.key])}
                      onChange={(e) =>
                        setConsents((prev) => ({ ...prev, [c.key]: e.target.checked }))
                      }
                    />
                    <span>
                      {c.label} <span className="text-[var(--color-ink-muted)]">Opcional</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="flex flex-col gap-2 pt-2">
              <Button fullWidth onClick={goReview}>
                Revisar
              </Button>
              <Button fullWidth variant="ghost" onClick={() => setStep("anamnese")}>
                Voltar
              </Button>
            </div>
          </div>
        ) : null}

        {ctx && step === "revisao" ? (
          <div className="space-y-4">
            <section className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm">
              <h2 className="font-semibold text-[var(--color-ink)]">Seus dados</h2>
              <p>
                <span className="text-[var(--color-ink-muted)]">Nome:</span>{" "}
                {identity.full_name}
              </p>
              <p>
                <span className="text-[var(--color-ink-muted)]">Telefone:</span>{" "}
                {identity.phone}
              </p>
              {identity.email ? (
                <p>
                  <span className="text-[var(--color-ink-muted)]">E-mail:</span>{" "}
                  {identity.email}
                </p>
              ) : null}
              <p>
                <span className="text-[var(--color-ink-muted)]">Objetivo:</span>{" "}
                {identity.primary_goal}
              </p>
              <p>
                <span className="text-[var(--color-ink-muted)]">Idade:</span>{" "}
                {identity.birth_date
                  ? `Nascimento ${identity.birth_date}`
                  : "Confirmado 18+"}
              </p>
            </section>
            <p className="text-sm text-[var(--color-ink-muted)]">
              {formNoun}: {Object.keys(answers).filter((k) => answers[k]).length} resposta(s)
              · Consentimentos:{" "}
              {Object.values(consents).filter(Boolean).length} aceito(s)
            </p>
            {attentionNow ? (
              <p className="rounded-[var(--radius-md)] border border-[var(--color-warning)]/25 bg-[var(--color-warning-subtle)] px-3 py-3 text-sm">
                {ctx.attention_client_message}
              </p>
            ) : null}
            <div className="flex flex-col gap-2 pt-2">
              <Button fullWidth disabled={busy} onClick={() => void submit()}>
                {busy ? "Enviando…" : "Enviar cadastro"}
              </Button>
              <Button fullWidth variant="ghost" onClick={() => setStep("consentimentos")}>
                Voltar
              </Button>
            </div>
          </div>
        ) : null}

        {step === "enviado" && result ? (
          <div className="space-y-5">
            <section className="rounded-[var(--radius-lg)] border border-[var(--color-success)]/25 bg-[var(--color-success-subtle)] p-4">
              <h2 className="text-lg font-semibold text-[var(--color-ink)]">
                Cadastro enviado
              </h2>
              <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
                Seu profissional vai analisar as informações. Guarde o link abaixo para
                acompanhar.
              </p>
            </section>
            {result.requires_professional_attention && result.attention_message ? (
              <p
                role="status"
                className="rounded-[var(--radius-md)] border border-[var(--color-warning)]/25 bg-[var(--color-warning-subtle)] px-3 py-3 text-sm"
              >
                {result.attention_message}
              </p>
            ) : null}
            {result.portal_token || result.portal_path ? (
              <div className="space-y-2">
                <Link
                  href={
                    result.portal_path ||
                    `/c/${result.portal_token}`
                  }
                  className="block"
                >
                  <Button fullWidth>Abrir meu acompanhamento</Button>
                </Link>
                <p className="text-xs text-[var(--color-ink-muted)]">
                  Link pessoal — não compartilhe.
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </main>
    </div>
  );
}
