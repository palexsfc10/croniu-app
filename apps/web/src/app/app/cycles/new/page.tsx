"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiFetch, reaisToCents, type Client, type Cycle, type Service } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";

const schema = z.object({
  client_id: z.string().uuid("Selecione o cliente."),
  service_id: z.string().uuid("Selecione o serviço."),
  starts_on: z.string().min(1, "Informe o início."),
  ends_on: z.string().min(1, "Informe o fim."),
  price_reais: z.string().optional(),
  create_receivable: z.boolean(),
});

type Values = z.infer<typeof schema>;

function NewCycleForm() {
  const router = useRouter();
  const search = useSearchParams();
  const [clients, setClients] = useState<Client[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      client_id: search.get("clientId") ?? "",
      service_id: "",
      starts_on: new Date().toISOString().slice(0, 10),
      ends_on: "",
      price_reais: "",
      create_receivable: true,
    },
  });

  const serviceId = watch("service_id");

  const startsOn = watch("starts_on");

  useEffect(() => {
    void (async () => {
      const [c, s] = await Promise.all([
        apiFetch<Client[]>("/api/v1/clients"),
        apiFetch<Service[]>("/api/v1/services"),
      ]);
      setClients(c.data ?? []);
      setServices(s.data ?? []);
    })();
  }, []);

  useEffect(() => {
    const service = services.find((item) => item.id === serviceId);
    if (!service || !startsOn) return;
    const d = new Date(`${startsOn}T12:00:00`);
    d.setDate(d.getDate() + service.default_duration_days);
    setValue("ends_on", d.toISOString().slice(0, 10));
    if (service.default_price_cents != null) {
      setValue("price_reais", (service.default_price_cents / 100).toFixed(2).replace(".", ","));
    }
  }, [serviceId, services, setValue, startsOn]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const cents = values.price_reais ? reaisToCents(values.price_reais) : null;
    if (values.price_reais && cents == null) {
      setFormError("Valor inválido.");
      return;
    }
    const result = await apiFetch<Cycle>("/api/v1/cycles", {
      method: "POST",
      body: JSON.stringify({
        client_id: values.client_id,
        service_id: values.service_id,
        starts_on: values.starts_on,
        ends_on: values.ends_on,
        value_cents: cents,
        create_receivable: values.create_receivable,
      }),
    });
    if (result.error) {
      setFormError(result.error.message);
      return;
    }
    router.replace(`/app/cycles/${result.data!.id}`);
  });

  return (
    <div className="space-y-4 animate-fade-up">
      <Link href="/app/cycles" className="text-sm font-semibold text-[var(--color-ink-muted)]">
        Voltar
      </Link>
      <h1 className="h-display text-3xl text-[var(--color-ink)]">Novo ciclo</h1>
      <p className="text-sm text-[var(--color-ink-muted)]">
        Escolha cliente e serviço; as datas e o valor são sugeridos.
      </p>
      {!services.length ? (
        <p className="text-sm text-[var(--color-warning)]">
          Cadastre um{" "}
          <Link href="/app/services/new" className="font-semibold underline">
            serviço
          </Link>{" "}
          antes.
        </p>
      ) : null}
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Cliente</span>
          <select
            className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
            {...register("client_id")}
          >
            <option value="">Selecione</option>
            {clients.map((item) => (
              <option key={item.id} value={item.id}>
                {item.full_name}
              </option>
            ))}
          </select>
          {errors.client_id ? (
            <span className="text-sm text-[var(--color-danger)]">{errors.client_id.message}</span>
          ) : null}
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Serviço</span>
          <select
            className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
            {...register("service_id")}
          >
            <option value="">Selecione</option>
            {services.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          {errors.service_id ? (
            <span className="text-sm text-[var(--color-danger)]">{errors.service_id.message}</span>
          ) : null}
        </label>
        <TextField label="Início" type="date" error={errors.starts_on?.message} {...register("starts_on")} />
        <TextField label="Fim" type="date" error={errors.ends_on?.message} {...register("ends_on")} />
        <TextField label="Valor (R$)" inputMode="decimal" {...register("price_reais")} />
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" {...register("create_receivable")} />
          Criar recebimento pendente
        </label>
        {formError ? (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {formError}
          </p>
        ) : null}
        <Button type="submit" fullWidth disabled={isSubmitting || !services.length}>
          {isSubmitting ? "Criando…" : "Criar ciclo"}
        </Button>
      </form>
    </div>
  );
}

export default function NewCyclePage() {
  return (
    <Suspense fallback={<p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p>}>
      <NewCycleForm />
    </Suspense>
  );
}
