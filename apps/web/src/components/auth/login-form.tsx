"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiFetch, type MeResponse } from "@/lib/api";
import { loginSchema, type LoginValues } from "@/lib/validators";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";

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
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    setErrorCode(null);
    const result = await apiFetch<MeResponse>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify(values),
    });
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
  });

  return (
    <form
      onSubmit={(event) => {
        const synced = valuesFromForm(event.currentTarget);
        setValue("email", synced.email, { shouldValidate: false });
        setValue("password", synced.password, { shouldValidate: false });
        void onSubmit(event);
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
        <Button type="submit" variant="brand" fullWidth disabled={isSubmitting}>
          {isSubmitting ? "Entrando…" : "Entrar"}
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
