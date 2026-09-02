"use client";

import { BackLink } from "@/components/app/back-link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiFetch, type Client } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { TextArea } from "@/components/ui/text-area";

const schema = z.object({
  full_name: z.string().trim().min(2, "Informe o nome."),
  phone: z.string().optional(),
  email: z.string().optional(),
  notes: z.string().optional(),
});

type Values = z.infer<typeof schema>;

/**
 * PATCH /api/v1/clients/{id} already accepted full_name/phone/email/notes —
 * this form was the only piece missing. "Editar dados" used to just switch
 * to a read-only tab; this is the real edit action.
 */
export default function EditClientPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { full_name: "", phone: "", email: "", notes: "" },
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await apiFetch<Client>(`/api/v1/clients/${clientId}`);
      if (cancelled) return;
      if (result.error) {
        setLoadError(result.error.message);
      } else if (result.data) {
        reset({
          full_name: result.data.full_name,
          phone: result.data.phone || "",
          email: result.data.email || "",
          notes: result.data.notes || "",
        });
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId, reset]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const result = await apiFetch<Client>(`/api/v1/clients/${clientId}`, {
      method: "PATCH",
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
    router.replace(`/app/clients/${clientId}`);
    router.refresh();
  });

  return (
    <div className="space-y-4 animate-fade-up">
      <div>
        <BackLink href={`/app/clients/${clientId}`} label="Voltar" />
        <h1 className="mt-2 h-display text-3xl text-[var(--color-ink)]">Editar cliente</h1>
      </div>
      {loading ? (
        <p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p>
      ) : loadError ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {loadError}
        </p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <TextField label="Nome" error={errors.full_name?.message} {...register("full_name")} />
          <TextField label="Telefone (WhatsApp)" inputMode="tel" {...register("phone")} />
          <TextField label="E-mail" type="email" inputMode="email" {...register("email")} />
          <TextArea label="Observações" {...register("notes")} />
          {formError ? (
            <p role="alert" className="text-sm text-[var(--color-danger)]">
              {formError}
            </p>
          ) : null}
          <Button type="submit" fullWidth disabled={isSubmitting}>
            {isSubmitting ? "Salvando…" : "Salvar alterações"}
          </Button>
        </form>
      )}
    </div>
  );
}
