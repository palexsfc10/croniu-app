"use client";

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

function valuesFromClient(client: Client): Values {
  return {
    full_name: client.full_name,
    phone: client.phone || "",
    email: client.email || "",
    notes: client.notes || "",
  };
}

/**
 * The editable fields themselves — no page chrome, no fetch. Shared by the
 * standalone `/edit` page (mobile, and the desktop fallback for direct
 * links) and `ClientEditDrawer` (desktop's inline panel), so the two
 * surfaces can never drift in which fields exist or how a save behaves.
 * PATCH /api/v1/clients/{id} already accepted full_name/phone/email/notes.
 */
export function ClientEditForm({
  client,
  onSaved,
  onDirtyChange,
  footerClassName = "",
}: {
  client: Client;
  onSaved: (updated: Client) => void;
  /** Lets a wrapper (the drawer) know whether closing now would discard
   * real edits, without duplicating react-hook-form's own dirty tracking. */
  onDirtyChange?: (dirty: boolean) => void;
  footerClassName?: string;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: valuesFromClient(client),
  });

  useEffect(() => {
    reset(valuesFromClient(client));
    // Re-sync only when switching to a genuinely different client record —
    // not on every parent re-render, which would otherwise silently
    // discard in-progress edits if the drawer's host component happens to
    // re-fetch the same client while this form is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id, reset]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const result = await apiFetch<Client>(`/api/v1/clients/${client.id}`, {
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
    onSaved(result.data ?? client);
  });

  return (
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
      <div className={footerClassName}>
        <Button type="submit" fullWidth disabled={isSubmitting}>
          {isSubmitting ? "Salvando…" : "Salvar alterações"}
        </Button>
      </div>
    </form>
  );
}
