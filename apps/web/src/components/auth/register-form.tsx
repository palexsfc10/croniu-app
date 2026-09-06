"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useForm, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiFetch, type ApiError, type GoogleAuthResponse, type MeResponse } from "@/lib/api";
import { registerSchema, type RegisterValues } from "@/lib/validators";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { GoogleAuthButton } from "@/components/auth/google-auth-button";
import { isGoogleAuthConfigured } from "@/lib/google-auth";
import { safeReturnTo } from "@/lib/nomenclature";

type RegisterResult = MeResponse & {
  requires_email_verification?: boolean;
  onboarding_required?: boolean;
  message?: string | null;
};

function humanRegisterError(error: ApiError & { status?: number }): { title: string; body: string } {
  const title = "Não foi possível criar sua conta";
  if (error.code === "email_taken") {
    return { title, body: "Este e-mail já possui uma conta. Entre ou use outro e-mail." };
  }
  if (error.status === 429 || error.code === "rate_limited") {
    return { title, body: "Muitas tentativas. Aguarde um momento e tente novamente." };
  }
  if (error.code === "network_error") {
    return { title, body: "Falha temporária de conexão. Verifique a rede e tente novamente." };
  }
  return { title, body: "Revise as informações ou tente novamente." };
}

function postAuthDestination(nextPath: string | null, onboardingRequired: boolean): string {
  if (onboardingRequired) {
    return nextPath ? `/app/onboarding?next=${encodeURIComponent(nextPath)}` : "/app/onboarding";
  }
  return nextPath || "/app";
}

type ReferralCheck = { valid: boolean; code: string; discount_percent?: number | null };

function RegisterFormInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [formError, setFormError] = useState<{ title: string; body: string } | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const referralCode = (searchParams.get("ref") || "").trim();
  const nextPath = safeReturnTo(searchParams.get("next"));
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
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      full_name: "",
      organization_name: "",
      email: "",
      password: "",
    },
  });

  async function submitRegister(values: RegisterValues) {
    setFormError(null);
    const result = await apiFetch<RegisterResult>("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({
        full_name: values.full_name,
        organization_name: values.organization_name,
        email: values.email,
        password: values.password,
        referral_code: referralCode || null,
      }),
    });
    if (result.error) {
      setFormError(humanRegisterError({ ...result.error, status: result.status }));
      return;
    }
    if (result.data?.requires_email_verification) {
      setPendingEmail(values.email);
      return;
    }
    router.replace(postAuthDestination(nextPath, result.data?.onboarding_required ?? true));
    router.refresh();
  }

  function onRegisterFieldErrors(fieldErrors: FieldErrors<RegisterValues>) {
    const first =
      fieldErrors.email?.message ||
      fieldErrors.password?.message ||
      fieldErrors.full_name?.message ||
      fieldErrors.organization_name?.message;
    setFormError({
      title: "Não foi possível criar sua conta",
      body: first || "Revise as informações ou tente novamente.",
    });
  }

  const onSubmit = handleSubmit(submitRegister, onRegisterFieldErrors);

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
    router.replace(postAuthDestination(nextPath, result.data?.onboarding_required ?? false));
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
    router.replace(postAuthDestination(nextPath, result.data?.onboarding_required ?? false));
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
        void onSubmit();
      }}
      className="flex flex-1 flex-col gap-4"
      noValidate
    >
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

      <div className="space-y-4">
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
        <Button type="submit" fullWidth disabled={isSubmitting}>
          {isSubmitting ? "Criando conta…" : formError ? "Tentar novamente" : "Criar minha conta"}
        </Button>
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
