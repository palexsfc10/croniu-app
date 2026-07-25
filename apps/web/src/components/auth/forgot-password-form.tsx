"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiFetch } from "@/lib/api";
import { forgotPasswordSchema, type ForgotPasswordValues } from "@/lib/validators";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";

type RequestResponse = {
  message: string;
  dev_reset_token?: string | null;
};

export function ForgotPasswordForm() {
  const [doneMessage, setDoneMessage] = useState<string | null>(null);
  const [devToken, setDevToken] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    setDoneMessage(null);
    setDevToken(null);
    const result = await apiFetch<RequestResponse>("/api/v1/auth/password-reset/request", {
      method: "POST",
      body: JSON.stringify(values),
    });
    if (result.error) {
      setFormError(result.error.message);
      return;
    }
    setDoneMessage(result.data?.message ?? "Se existir uma conta, enviaremos as instruções.");
    if (result.data?.dev_reset_token) {
      setDevToken(result.data.dev_reset_token);
    }
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-1 flex-col gap-4" noValidate>
      <div className="space-y-4">
        <TextField
          label="E-mail"
          type="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          enterKeyHint="done"
          error={errors.email?.message}
          {...register("email")}
        />
        {formError ? (
          <p
            role="alert"
            className="rounded-[var(--radius-sm)] bg-red-50 px-3 py-2 text-sm text-[var(--color-danger)]"
          >
            {formError}
          </p>
        ) : null}
        {doneMessage ? (
          <p
            role="status"
            className="rounded-[var(--radius-sm)] bg-[var(--color-surface-muted)] px-3 py-2 text-sm text-[var(--color-ink)]"
          >
            {doneMessage}
          </p>
        ) : null}
        {devToken ? (
          <p className="rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-ink-muted)]">
            Ambiente local (sem e-mail):{" "}
            <Link
              className="font-semibold text-[var(--color-primary)] underline-offset-2 hover:underline"
              href={`/reset-password?token=${encodeURIComponent(devToken)}`}
            >
              abrir redefinição
            </Link>
          </p>
        ) : null}
      </div>
      <div className="mt-auto space-y-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <Button type="submit" variant="brand" fullWidth disabled={isSubmitting}>
          {isSubmitting ? "Enviando…" : "Enviar link"}
        </Button>
        <p className="text-center text-sm text-[var(--color-ink-muted)]">
          <Link
            className="font-semibold text-[var(--color-primary)] underline-offset-2 hover:underline"
            href="/login"
          >
            Voltar ao login
          </Link>
        </p>
      </div>
    </form>
  );
}
