"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiFetch } from "@/lib/api";
import { resetPasswordSchema, type ResetPasswordValues } from "@/lib/validators";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";

function ResetPasswordFormInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirm_password: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    if (!token) {
      setFormError("Link inválido. Solicite uma nova redefinição.");
      return;
    }
    const result = await apiFetch<{ message: string }>("/api/v1/auth/password-reset/confirm", {
      method: "POST",
      body: JSON.stringify({ token, password: values.password }),
    });
    if (result.error) {
      setFormError(result.error.message);
      return;
    }
    setDone(true);
    window.setTimeout(() => {
      router.replace("/login");
      router.refresh();
    }, 1200);
  });

  if (!token) {
    return (
      <div className="space-y-4">
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          Link de redefinição ausente ou incompleto.
        </p>
        <Link
          href="/forgot-password"
          className="inline-flex text-sm font-semibold text-[var(--color-primary)] underline-offset-2 hover:underline"
        >
          Solicitar novo link
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-1 flex-col gap-4" noValidate>
      <div className="space-y-4">
        <TextField
          label="Nova senha"
          type="password"
          autoComplete="new-password"
          revealable
          error={errors.password?.message}
          {...register("password")}
        />
        <TextField
          label="Confirmar nova senha"
          type="password"
          autoComplete="new-password"
          revealable
          error={errors.confirm_password?.message}
          {...register("confirm_password")}
        />
        {formError ? (
          <p
            role="alert"
            className="rounded-[var(--radius-sm)] bg-[var(--color-danger-subtle)] px-3 py-2 text-sm text-[var(--color-danger)]"
          >
            {formError}
          </p>
        ) : null}
        {done ? (
          <p role="status" className="text-sm text-[var(--color-success)]">
            Senha atualizada. Redirecionando para o login…
          </p>
        ) : null}
      </div>
      <div className="mt-auto space-y-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <Button type="submit" variant="brand" fullWidth disabled={isSubmitting || done}>
          {isSubmitting ? "Salvando…" : "Salvar nova senha"}
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

export function ResetPasswordForm() {
  return (
    <Suspense fallback={<p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p>}>
      <ResetPasswordFormInner />
    </Suspense>
  );
}
