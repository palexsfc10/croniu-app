"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiFetch, type GoogleAuthResponse, type MeResponse } from "@/lib/api";
import { loginSchema, type LoginValues } from "@/lib/validators";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { GoogleAuthButton } from "@/components/auth/google-auth-button";
import { isGoogleAuthConfigured } from "@/lib/google-auth";

function valuesFromForm(form: HTMLFormElement): LoginValues {
  const data = new FormData(form);
  return {
    email: String(data.get("email") ?? ""),
    password: String(data.get("password") ?? ""),
  };
}

function LoginFormInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const verified = searchParams.get("verified") === "1";
  const [formError, setFormError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [pendingGoogleCredential, setPendingGoogleCredential] = useState<string | null>(null);
  const [linkPassword, setLinkPassword] = useState("");
  const [linkSubmitting, setLinkSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const me = await apiFetch<MeResponse>("/api/v1/auth/me");
      if (cancelled || !me.data) return;
      router.replace("/app");
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);
  const {
    register,
    setValue,
    setError,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });
  const [submitting, setSubmitting] = useState(false);

  async function authenticate(values: LoginValues) {
    const parsed = loginSchema.safeParse(values);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === "email" || field === "password") {
          setError(field, { message: issue.message });
        }
      }
      return;
    }
    setFormError(null);
    setErrorCode(null);
    setSubmitting(true);
    const result = await apiFetch<MeResponse>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify(parsed.data),
    });
    setSubmitting(false);
    if (result.error) {
      setErrorCode(result.error.code);
      if (result.error.code === "email_unverified") {
        setFormError(
          "Seu e-mail ainda não foi verificado. Você pode verificar ou reenviar o link.",
        );
        return;
      }
      setFormError(result.error.message);
      return;
    }
    router.replace("/app");
    router.refresh();
  }

  async function handleGoogleCredential(credential: string) {
    setFormError(null);
    setErrorCode(null);
    setPendingGoogleCredential(null);
    setGoogleSubmitting(true);
    const result = await apiFetch<GoogleAuthResponse>("/api/v1/auth/google", {
      method: "POST",
      body: JSON.stringify({ credential }),
    });
    setGoogleSubmitting(false);
    if (result.error) {
      setErrorCode(result.error.code);
      if (result.error.code === "google_link_required") {
        setPendingGoogleCredential(credential);
        setFormError(
          "Já existe uma conta com este e-mail. Confirme sua senha para conectar o Google.",
        );
        return;
      }
      setFormError(result.error.message);
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
      setFormError(result.error.message || "Senha incorreta.");
      return;
    }
    router.replace("/app");
    router.refresh();
  }

  return (
    <form
      method="post"
      action="/login"
      onSubmit={(event) => {
        event.preventDefault();
        const synced = valuesFromForm(event.currentTarget);
        setValue("email", synced.email, { shouldValidate: false });
        setValue("password", synced.password, { shouldValidate: false });
        void authenticate(synced);
      }}
      className="flex flex-1 flex-col gap-4"
      noValidate
    >
      <div className="space-y-4">
        {verified ? (
          <p
            role="status"
            className="rounded-[var(--radius-sm)] bg-[var(--color-surface-muted)] px-3 py-2 text-sm text-[var(--color-ink)]"
          >
            E-mail confirmado. Entre com sua senha para acessar o Croniu.
          </p>
        ) : null}
        {isGoogleAuthConfigured ? (
          <div className="space-y-4">
            <GoogleAuthButton
              text="signin_with"
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
          label="E-mail"
          id="login-email"
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
          id="login-password"
          type="password"
          autoComplete="current-password"
          enterKeyHint="done"
          revealable
          error={errors.password?.message}
          {...register("password")}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link
            href="/verify-email"
            className="text-sm font-semibold text-[var(--color-primary)] underline-offset-2 hover:underline"
          >
            Reenviar verificação
          </Link>
          <Link
            href="/forgot-password"
            className="text-sm font-semibold text-[var(--color-primary)] underline-offset-2 hover:underline"
          >
            Esqueci minha senha
          </Link>
        </div>
        {formError ? (
          <p
            role="alert"
            className="rounded-[var(--radius-sm)] bg-[var(--color-danger-subtle)] px-3 py-2 text-sm text-[var(--color-danger)]"
          >
            {formError}
            {errorCode === "email_unverified" ? (
              <>
                {" "}
                <Link
                  href="/verify-email"
                  className="font-semibold underline underline-offset-2"
                >
                  Abrir verificação
                </Link>
              </>
            ) : null}
          </p>
        ) : null}
      </div>
      <div className="mt-auto space-y-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <Button type="submit" variant="brand" fullWidth disabled={submitting}>
          {submitting ? "Entrando…" : "Entrar"}
        </Button>
        <p className="text-center text-sm text-[var(--color-ink-muted)]">
          Novo no Croniu?{" "}
          <Link
            className="font-semibold text-[var(--color-primary)] underline-offset-2 hover:underline"
            href="/register"
          >
            Criar conta
          </Link>
        </p>
      </div>
    </form>
  );
}

export function LoginForm() {
  return (
    <Suspense fallback={<p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p>}>
      <LoginFormInner />
    </Suspense>
  );
}
