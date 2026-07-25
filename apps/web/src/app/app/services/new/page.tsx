"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiFetch, reaisToCents, type Service } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";

const schema = z.object({
  name: z.string().trim().min(2, "Informe o nome."),
  description: z.string().optional(),
  default_duration_days: z.number().min(1).max(730),
  price_reais: z.string().optional(),
});

type Values = z.infer<typeof schema>;

export default function NewServicePage() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      description: "",
      default_duration_days: 30,
      price_reais: "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const cents = values.price_reais ? reaisToCents(values.price_reais) : null;
    if (values.price_reais && cents == null) {
      setFormError("Valor inválido.");
      return;
    }
    const result = await apiFetch<Service>("/api/v1/services", {
      method: "POST",
      body: JSON.stringify({
        name: values.name,
        description: values.description || null,
        default_duration_days: values.default_duration_days,
        default_price_cents: cents,
      }),
    });
    if (result.error) {
      setFormError(result.error.message);
      return;
    }
    router.replace("/app/services");
  });

  return (
    <div className="space-y-4 animate-fade-up">
      <Link href="/app/services" className="text-sm font-semibold text-[var(--color-ink-muted)]">
        Voltar
      </Link>
      <h1 className="h-display text-3xl text-[var(--color-ink)]">Novo serviço</h1>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <TextField label="Nome" error={errors.name?.message} {...register("name")} />
        <TextField label="Descrição" {...register("description")} />
        <TextField
          label="Duração padrão (dias)"
          type="number"
          error={errors.default_duration_days?.message}
          {...register("default_duration_days", { valueAsNumber: true })}
        />
        <TextField label="Valor padrão (R$)" inputMode="decimal" {...register("price_reais")} />
        {formError ? (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {formError}
          </p>
        ) : null}
        <Button type="submit" fullWidth disabled={isSubmitting}>
          {isSubmitting ? "Salvando…" : "Salvar serviço"}
        </Button>
      </form>
    </div>
  );
}
