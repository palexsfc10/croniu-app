"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiFetch, type PlatformMe } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";

const schema = z.object({
  email: z.string().email("E-mail inválido."),
  password: z.string().min(1, "Informe a senha."),
});

type Values = z.infer<typeof schema>;

export function AdminLoginForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const result = await apiFetch<PlatformMe>("/api/v1/platform/auth/login", {
      method: "POST",
      body: JSON.stringify(values),
    });
    if (result.error) {
      setFormError(result.error.message);
      return;
    }
    router.replace("/dashboard");
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <TextField label="E-mail" type="email" autoComplete="username" error={errors.email?.message} {...register("email")} />
      <TextField
        label="Senha"
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register("password")}
      />
      {formError ? (
        <p role="alert" className="rounded-[var(--radius-md)] bg-red-50 px-3 py-2 text-sm text-[var(--color-danger)]">
          {formError}
        </p>
      ) : null}
      <Button type="submit" fullWidth disabled={isSubmitting}>
        {isSubmitting ? "Entrando…" : "Entrar no admin"}
      </Button>
    </form>
  );
}
