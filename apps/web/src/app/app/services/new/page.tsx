"use client";

import { BackLink } from "@/components/app/back-link";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch, reaisToCents, type Service } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";

export default function NewServicePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priceReais, setPriceReais] = useState("90,00");
  const [minutes, setMinutes] = useState(60);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const cents = reaisToCents(priceReais);
    if (cents == null) {
      setSaving(false);
      setError("Valor por aula inválido.");
      return;
    }
    const result = await apiFetch<Service>("/api/v1/services", {
      method: "POST",
      body: JSON.stringify({
        name,
        description: description || null,
        default_duration_minutes: minutes,
        default_duration_days: 30,
        default_price_cents: cents,
      }),
    });
    setSaving(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    router.replace("/app/services");
  }

  return (
    <div className="space-y-4 animate-fade-up">
      <BackLink href="/app/services" label="Serviços" />
      <h1 className="h-display text-3xl text-[var(--color-ink)]">Novo serviço</h1>
      <p className="text-sm text-[var(--color-ink-muted)]">
        O preço é por aula. Alterar depois não muda ciclos já criados.
      </p>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <TextField label="Nome" value={name} onChange={(e) => setName(e.target.value)} required />
        <TextField
          label="Descrição (opcional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <TextField
          label="Valor por aula (R$)"
          inputMode="decimal"
          value={priceReais}
          onChange={(e) => setPriceReais(e.target.value)}
          required
        />
        <TextField
          label="Duração padrão da aula (minutos)"
          type="number"
          value={String(minutes)}
          onChange={(e) => setMinutes(Number(e.target.value) || 60)}
          required
        />
        {error ? (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {error}
          </p>
        ) : null}
        <Button type="submit" fullWidth disabled={saving}>
          {saving ? "Salvando…" : "Salvar serviço"}
        </Button>
      </form>
    </div>
  );
}
