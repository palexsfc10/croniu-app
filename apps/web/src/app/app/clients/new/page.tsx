"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiFetch, type Client } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";

const schema = z.object({
  full_name: z.string().trim().min(2, "Informe o nome."),
  phone: z.string().optional(),
  email: z.string().optional(),
  notes: z.string().optional(),
});

type Values = z.infer<typeof schema>;

export default function NewClientPage() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { full_name: "", phone: "", email: "", notes: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const result = await apiFetch<Client>("/api/v1/clients", {
      method: "POST",
      body: JSON.stringify({
        full_name: values.full_name,
        phone: values.phone || null,
        email: values.email || null,
        notes: values.notes || null,
      }),
    });
    if (result.error) {
      setFormError(result.error.message);
      return;
    }
    router.replace(`/app/clients/${result.data!.id}`);
    router.refresh();
  });

  return (
    <div className="space-y-4 animate-fade-up">
      <div>
        <Link href="/app/clients" className="text-sm font-semibold text-[var(--color-ink-muted)]">
          Voltar
        </Link>
        <h1 className="mt-2 h-display text-3xl text-[var(--color-ink)]">Novo cliente</h1>
      </div>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <TextField label="Nome" error={errors.full_name?.message} {...register("full_name")} />
        <TextField label="Telefone (WhatsApp)" inputMode="tel" {...register("phone")} />
        <TextField label="E-mail" type="email" inputMode="email" {...register("email")} />
        <TextField label="Observações" {...register("notes")} />
        {formError ? (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {formError}
          </p>
        ) : null}
        <Button type="submit" fullWidth disabled={isSubmitting}>
          {isSubmitting ? "Salvando…" : "Salvar cliente"}
        </Button>
      </form>
    </div>
  );
}
