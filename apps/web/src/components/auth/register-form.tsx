"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiFetch, type ApiError, type GoogleAuthResponse, type MeResponse } from "@/lib/api";
import { registerSchema, type RegisterValues } from "@/lib/validators";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { GoogleAuthButton } from "@/components/auth/google-auth-button";
import { isGoogleAuthConfigured } from "@/lib/google-auth";
import {
  REGISTER_PROFESSION_OPTIONS,
  SPORTS_SPECIALTIES,
  TUTOR_SPECIALTIES,
  USE_CASE_OPTIONS,
} from "@/lib/nomenclature";
import { registerExperienceSummary } from "@/lib/capabilities";
import {
  IconCalendarDays,
  IconClipboardList,
  IconLayers,
  IconRefreshCw,
  IconUsersRound,
} from "@/components/ui/icons";

type RegisterResult = MeResponse & {
  requires_email_verification?: boolean;
  message?: string | null;
};

function humanRegisterError(error: ApiError & { status?: number }): { title: string; body: string } {
  const title = "Não foi possível criar sua conta";
  if (error.code === "email_taken") {
    return { title, body: "Este e-mail já possui uma conta. Entre ou use outro e-mail." };
  }
  if (error.code === "invalid_profession") {
    return { title, body: error.message || "A área de atuação informada não é válida." };
  }
  if (error.status === 429 || error.code === "rate_limited") {
    return { title, body: "Muitas tentativas. Aguarde um momento e tente novamente." };
  }
  if (error.code === "network_error") {
    return { title, body: "Falha temporária de conexão. Verifique a rede e tente novamente." };
  }
  return { title, body: "Revise as informações ou tente novamente." };
}

type ReferralCheck = { valid: boolean; code: string; discount_percent?: number | null };

function RegisterFormInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const submittingLock = useRef(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [formError, setFormError] = useState<{ title: string; body: string } | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const referralCode = (searchParams.get("ref") || "").trim();
  const [referralCheck, setReferralCheck] = useState<ReferralCheck | null>(null);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [pendingGoogleCredential, setPendingGoogleCredential] = useState<string | null>(null);
  const [linkPassword, setLinkPassword] = useState("");
  const [linkSubmitting, setLinkSubmitting] = useState(false);

  useEffect(() => {
    if (!referralCode) return;
    let cancelled = false;
    void apiFetch<ReferralCheck>(
      `/api/v1/referrals/validate?code=${encodeURIComponent(referralCode)}`,
    ).then((result) => {
      if (!cancelled && result.data) setReferralCheck(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [referralCode]);
  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    shouldUnregister: false,
    defaultValues: {
      full_name: "",
      organization_name: "",
      email: "",
      password: "",
      profession_code: "",
      profession_specialty: "",
      profession_other: "",
      use_cases: [],
    },
  });

  const profession = watch("profession_code");
  const specialty = watch("profession_specialty");
  const useCases = watch("use_cases") ?? [];
  const experience = registerExperienceSummary(profession, useCases);

  function toggleUseCase(code: string) {
    const next = useCases.includes(code)
      ? useCases.filter((item) => item !== code)
      : [...useCases, code];
    setValue("use_cases", next, { shouldValidate: false });
  }

  function goNext(form?: HTMLFormElement | null) {
    const data = form ? new FormData(form) : null;
    const values = getValues();
    const full_name = String(data?.get("full_name") ?? values.full_name).trim();
    const organization_name = String(
      data?.get("organization_name") ?? values.organization_name,
    ).trim();
    const email = String(data?.get("email") ?? values.email).trim();
    const password = String(data?.get("password") ?? values.password);
    setValue("full_name", full_name, { shouldValidate: false });
    setValue("organization_name", organization_name, { shouldValidate: false });
    setValue("email", email, { shouldValidate: false });
    setValue("password", password, { shouldValidate: false });
    if (full_name.length < 2) {
      setFormError({ title: "Não foi possível criar sua conta", body: "Informe seu nome." });
      return;
    }
    if (organization_name.length < 2) {
      setFormError({
        title: "Não foi possível criar sua conta",
        body: "Informe o nome do negócio.",
      });
      return;
    }
    if (!email.includes("@")) {
      setFormError({ title: "Não foi possível criar sua conta", body: "E-mail inválido." });
      return;
    }
    if (password.length < 8) {
      setFormError({
        title: "Não foi possível criar sua conta",
        body: "A senha deve ter pelo menos 8 caracteres.",
      });
      return;
    }
    setFormError(null);
    setStep(2);
  }

  const onSubmit = handleSubmit(
    async (values) => {
      if (step !== 2) {
        goNext();
        return;
      }
      if (submittingLock.current) return;
      submittingLock.current = true;
      setFormError(null);
      const result = await apiFetch<RegisterResult>("/api/v1/auth/register", {
        method: "POST",
        body: JSON.stringify({
          full_name: values.full_name,
          organization_name: values.organization_name,
          email: values.email,
          password: values.password,
          profession_code: values.profession_code,
          profession_specialty: values.profession_specialty || null,
          profession_other: values.profession_other || null,
          use_cases: values.use_cases?.length ? values.use_cases : null,
          referral_code: referralCode || null,
        }),
      });
      submittingLock.current = false;
      if (result.error) {
        setFormError(humanRegisterError({ ...result.error, status: result.status }));
        return;
      }
      if (result.data?.requires_email_verification) {
        setPendingEmail(values.email);
        return;
      }
      router.replace("/app");
      router.refresh();
    },
    (fieldErrors) => {
      const first =
        fieldErrors.profession_code?.message ||
        fieldErrors.profession_other?.message ||
        fieldErrors.email?.message ||
        fieldErrors.password?.message ||
        fieldErrors.full_name?.message ||
        fieldErrors.organization_name?.message;
      setFormError({
        title: "Não foi possível criar sua conta",
        body: first || "Revise as informações ou tente novamente.",
      });
    },
  );

  async function handleGoogleCredential(credential: string) {
    setFormError(null);
    setPendingGoogleCredential(null);
    setGoogleSubmitting(true);
    const result = await apiFetch<GoogleAuthResponse>("/api/v1/auth/google", {
      method: "POST",
      body: JSON.stringify({ credential }),
    });
    setGoogleSubmitting(false);
    if (result.error) {
      if (result.error.code === "google_link_required") {
        setPendingGoogleCredential(credential);
        setFormError({
          title: "Já existe uma conta com este e-mail",
          body: "Confirme sua senha para conectar o Google a essa conta.",
        });
        return;
      }
      setFormError(humanRegisterError({ ...result.error, status: result.status }));
      return;
    }
    router.replace("/app");
    router.refresh();
  }

  async function confirmGoogleLink() {
    if (!pendingGoogleCredential || !linkPassword) return;
    setLinkSubmitting(true);
    setFormError(null);
    const result = await apiFetch<GoogleAuthResponse>("/api/v1/auth/google/link", {
      method: "POST",
      body: JSON.stringify({ credential: pendingGoogleCredential, password: linkPassword }),
    });
    setLinkSubmitting(false);
    if (result.error) {
      setFormError({ title: "Não foi possível conectar", body: result.error.message || "Senha incorreta." });
      return;
    }
    router.replace("/app");
    router.refresh();
  }

  async function resendVerification() {
    const email = pendingEmail || getValues("email");
    if (!email) return;
    setFormError(null);
    const result = await apiFetch<{ message: string }>("/api/v1/auth/email-verification/request", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    if (result.error) {
      setFormError(humanRegisterError({ ...result.error, status: result.status }));
    }
  }

  if (pendingEmail) {
    return (
      <div className="flex flex-1 flex-col gap-4">
        <p className="text-sm text-[var(--color-ink)]">
          Conta criada. Enviamos um link para <strong>{pendingEmail}</strong>. Confirme o e-mail
          antes de entrar no Croniu.
        </p>
        {formError ? (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {formError.body}
          </p>
        ) : null}
        <Button type="button" fullWidth onClick={() => void resendVerification()}>
          Reenviar e-mail
        </Button>
        <Link
          href="/login"
          className="text-center text-sm font-semibold text-[var(--color-primary)] underline-offset-2 hover:underline"
        >
          Ir para o login
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
    <form
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (step === 1) {
          goNext(event.currentTarget);
          return;
        }
        void onSubmit();
      }}
      className="flex flex-1 flex-col gap-4"
      noValidate
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
        Etapa {step} de 2 · {step === 1 ? "Seus dados" : "Seu trabalho"}
      </p>

      {referralCode && referralCheck?.valid ? (
        <p className="rounded-[var(--radius-sm)] bg-[var(--color-success-subtle,theme(colors.green.50))] px-3 py-2 text-sm text-[var(--color-ink)]">
          Cupom {referralCheck.code} aplicado
          <br />
          Você terá {referralCheck.discount_percent ?? 10}% de desconto na assinatura após o
          período gratuito.
        </p>
      ) : null}
      {referralCode && referralCheck && !referralCheck.valid ? (
        <p className="rounded-[var(--radius-sm)] bg-[var(--color-surface-subtle)] px-3 py-2 text-sm text-[var(--color-ink-muted)]">
          Este cupom não está disponível.
        </p>
      ) : null}

      <div className={step === 1 ? "space-y-4" : "hidden"}>
        {isGoogleAuthConfigured ? (
          <div className="space-y-4">
            <GoogleAuthButton
              text="signup_with"
              disabled={googleSubmitting || linkSubmitting}
              onCredential={handleGoogleCredential}
            />
            <div className="flex items-center gap-3" aria-hidden="true">
              <span className="h-px flex-1 bg-[var(--color-border)]" />
              <span className="text-xs text-[var(--color-ink-muted)]">
                ou continue com seu e-mail
              </span>
              <span className="h-px flex-1 bg-[var(--color-border)]" />
            </div>
          </div>
        ) : null}
        {pendingGoogleCredential ? (
          <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
            <TextField
              label="Confirme sua senha do Croniu"
              type="password"
              revealable
              autoComplete="current-password"
              value={linkPassword}
              onChange={(event) => setLinkPassword(event.target.value)}
            />
            <Button
              type="button"
              fullWidth
              disabled={linkSubmitting || !linkPassword}
              onClick={() => void confirmGoogleLink()}
            >
              {linkSubmitting ? "Conectando…" : "Conectar Google e entrar"}
            </Button>
          </div>
        ) : null}
        <TextField
          label="Seu nome"
          autoComplete="name"
          autoCapitalize="words"
          enterKeyHint="next"
          error={errors.full_name?.message}
          {...register("full_name")}
        />
        <TextField
          label="Nome do negócio ou organização"
          hint="Pode ser seu nome profissional."
          autoComplete="organization"
          autoCapitalize="words"
          enterKeyHint="next"
          error={errors.organization_name?.message}
          {...register("organization_name")}
        />
        <TextField
          label="E-mail"
          type="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          enterKeyHint="next"
          error={errors.email?.message}
          {...register("email")}
        />
        <TextField
          label="Senha"
          type="password"
          autoComplete="new-password"
          enterKeyHint="done"
          revealable
          hint="Mínimo de 8 caracteres."
          error={errors.password?.message}
          {...register("password")}
        />
      </div>

      <div className={step === 2 ? "space-y-4" : "hidden"}>
        <fieldset>
          <legend className="text-sm font-medium text-[var(--color-ink)]">
            Qual é a sua área de atuação?
          </legend>
          <div className="mt-2 grid gap-2">
            {REGISTER_PROFESSION_OPTIONS.map((opt) => (
              <label
                key={opt.code}
                className={`flex min-h-11 cursor-pointer items-center rounded-[var(--radius-md)] border px-3 text-sm ${
                  profession === opt.code
                    ? "border-[var(--color-ink)] bg-[var(--color-surface-subtle)]"
                    : "border-[var(--color-border)]"
                }`}
              >
                <input
                  type="radio"
                  className="mr-2"
                  value={opt.code}
                  checked={profession === opt.code}
                  onChange={() => {
                    setValue("profession_code", opt.code, { shouldValidate: true });
                    setValue("profession_specialty", "");
                  }}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </fieldset>
        <TextField
          label="Especialidade (opcional)"
          placeholder="Ex.: professor de inglês, estética facial, nutrição clínica"
          {...register("profession_specialty")}
        />

        {profession === "sports_teacher" ? (
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Qual é sua principal especialidade?</span>
            <select
              className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
              value={specialty || ""}
              onChange={(e) => setValue("profession_specialty", e.target.value)}
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

        {profession === "private_tutor" ? (
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Qual é sua principal área de ensino?</span>
            <select
              className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
              value={specialty || ""}
              onChange={(e) => setValue("profession_specialty", e.target.value)}
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

        {profession === "other" || specialty === "other" ? (
          <TextField
            label={profession === "other" ? "Como você descreve sua atuação?" : "Qual especialidade?"}
            hint={
              profession === "other"
                ? "Ex.: fotógrafo, designer, massoterapeuta ou instrutor."
                : undefined
            }
            {...register("profession_other")}
          />
        ) : null}

        <fieldset>
          <legend className="text-sm font-medium">Como você acompanha seus clientes ou alunos?</legend>
          <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
            Escolha tudo o que fizer parte da sua rotina.
          </p>
          <div className="mt-2 grid gap-2">
            {USE_CASE_OPTIONS.map((opt) => (
              <label
                key={opt.code}
                className="flex min-h-11 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-sm"
              >
                <input
                  type="checkbox"
                  checked={useCases.includes(opt.code)}
                  onChange={() => toggleUseCase(opt.code)}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </fieldset>

        {experience.visible ? (
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm">
            <p className="font-medium">Sua experiência</p>
            <p className="mt-1 text-[var(--color-ink-muted)]">{experience.blurb}</p>
            <ul className="mt-2 space-y-2">
              {experience.items.map((item) => (
                <li key={item.id} className="flex items-center gap-2">
                  {item.id === "people" ? (
                    <IconUsersRound className="h-4 w-4" />
                  ) : item.id === "cycles" ? (
                    <IconRefreshCw className="h-4 w-4" />
                  ) : item.id === "plans" || item.id === "workouts" ? (
                    <IconLayers className="h-4 w-4" />
                  ) : item.id === "evaluations" || item.id === "followups" ? (
                    <IconClipboardList className="h-4 w-4" />
                  ) : (
                    <IconCalendarDays className="h-4 w-4" />
                  )}
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
              Você poderá alterar essas preferências depois.
            </p>
          </div>
        ) : null}
      </div>

      {formError ? (
        <div
          role="alert"
          className="rounded-[var(--radius-sm)] bg-[var(--color-danger-subtle)] px-3 py-2 text-sm text-[var(--color-danger)]"
        >
          <p className="font-semibold">{formError.title}</p>
          <p className="mt-0.5">{formError.body}</p>
        </div>
      ) : null}

      <div className="mt-auto space-y-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {step === 1 ? (
          <Button type="submit" fullWidth>
            Continuar
          </Button>
        ) : (
          <>
            <Button type="submit" fullWidth disabled={isSubmitting}>
              {isSubmitting
                ? "Criando conta…"
                : formError
                  ? "Tentar novamente"
                  : "Criar minha conta"}
            </Button>
            <Button type="button" variant="ghost" fullWidth onClick={() => setStep(1)}>
              Voltar
            </Button>
          </>
        )}
      </div>
    </form>
        <p className="relative z-20 text-center text-sm text-[var(--color-ink-muted)]">
          Já tem conta?{" "}
          <a
            data-testid="register-login-link"
            className="relative z-20 inline-flex min-h-11 items-center font-semibold text-[var(--color-primary)] underline-offset-2 hover:underline"
            href="/login"
          >
            Entrar
          </a>
        </p>
    </div>
  );
}

export function RegisterForm() {
  return (
    <Suspense fallback={<p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p>}>
      <RegisterFormInner />
    </Suspense>
  );
}
