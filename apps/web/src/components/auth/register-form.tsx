"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiFetch, type MeResponse } from "@/lib/api";
import { registerSchema, type RegisterValues } from "@/lib/validators";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";

function valuesFromForm(form: HTMLFormElement): RegisterValues {
  const data = new FormData(form);
  return {
    full_name: String(data.get("full_name") ?? ""),
    organization_name: String(data.get("organization_name") ?? ""),
    email: String(data.get("email") ?? ""),
    password: String(data.get("password") ?? ""),
  };
}

export function RegisterForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
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

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const result = await apiFetch<MeResponse>("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify(values),
    });
    if (result.error) {
      setFormError(result.error.message);
      return;
    }
    router.replace("/app");
    router.refresh();
  });

  return (
    <form
      onSubmit={(event) => {
        // Mobile autofill often fills the DOM without firing React change events.
        const synced = valuesFromForm(event.currentTarget);
        setValue("full_name", synced.full_name, { shouldValidate: false });
        setValue("organization_name", synced.organization_name, { shouldValidate: false });
        setValue("email", synced.email, { shouldValidate: false });
        setValue("password", synced.password, { shouldValidate: false });
        void onSubmit(event);
      }}
      className="flex flex-1 flex-col gap-4"
      noValidate
    >
      <div className="space-y-4">
        <TextField
          label="Seu nome"
          autoComplete="name"
          autoCapitalize="words"
          enterKeyHint="next"
          error={errors.full_name?.message}
          {...register("full_name")}
        />
        <TextField
          label="Nome do negócio / organização"
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
          error={errors.password?.message}
          {...register("password")}
        />
        {formError ? (
          <p
            role="alert"
            className="rounded-[var(--radius-sm)] bg-[var(--color-danger-subtle)] px-3 py-2 text-sm text-[var(--color-danger)]"
          >
            {formError}
          </p>
        ) : null}
      </div>
      <div className="mt-auto space-y-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <Button type="submit" fullWidth disabled={isSubmitting}>
          {isSubmitting ? "Criando conta…" : "Criar conta"}
        </Button>
        <p className="text-center text-sm text-[var(--color-ink-muted)]">
          Já tem conta?{" "}
          <Link
            className="font-semibold text-[var(--color-primary)] underline-offset-2 hover:underline"
            href="/login"
          >
            Entrar
          </Link>
        </p>
      </div>
    </form>
  );
}
