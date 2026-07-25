"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch, type CycleTemplate } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";

export default function NewCycleTemplatePage() {
  const router = useRouter();
  const [name, setName] = useState("2x por semana — mensal");
  const [weeklyFrequency, setWeeklyFrequency] = useState(2);
  const [durationType, setDurationType] = useState<"calendar_months" | "fixed_days">(
    "calendar_months",
  );
  const [durationValue, setDurationValue] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const result = await apiFetch<CycleTemplate>("/api/v1/cycle-templates", {
      method: "POST",
      body: JSON.stringify({
        name,
        weekly_frequency: weeklyFrequency,
        duration_type: durationType,
        duration_value: durationValue,
      }),
    });
    setSaving(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    router.replace("/app/cycle-templates");
  }

  return (
    <div className="space-y-4 animate-fade-up">
      <Link
        href="/app/cycle-templates"
        className="text-sm font-semibold text-[var(--color-ink-muted)]"
      >
        ← Modelos
      </Link>
      <h1 className="h-display text-3xl text-[var(--color-ink)]">Novo modelo</h1>
      <form onSubmit={onSubmit} className="space-y-4">
        <TextField label="Nome" value={name} onChange={(e) => setName(e.target.value)} required />
        <TextField
          label="Frequência semanal (aulas/semana)"
          type="number"
          value={String(weeklyFrequency)}
          onChange={(e) => setWeeklyFrequency(Number(e.target.value) || 1)}
          required
        />
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Tipo de duração</span>
          <select
            className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
            value={durationType}
            onChange={(e) =>
              setDurationType(e.target.value as "calendar_months" | "fixed_days")
            }
          >
            <option value="calendar_months">Meses do calendário (ex.: 1 mês)</option>
            <option value="fixed_days">Dias corridos (ex.: 30 dias)</option>
          </select>
        </label>
        <TextField
          label={durationType === "calendar_months" ? "Quantidade de meses" : "Quantidade de dias"}
          type="number"
          value={String(durationValue)}
          onChange={(e) => setDurationValue(Number(e.target.value) || 1)}
          required
        />
        <p className="text-sm text-[var(--color-ink-muted)]">
          “1 mês” e “30 dias” não são a mesma regra. O sistema calcula a renovação de forma
          diferente.
        </p>
        {error ? (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {error}
          </p>
        ) : null}
        <Button type="submit" fullWidth disabled={saving}>
          {saving ? "Salvando…" : "Salvar modelo"}
        </Button>
      </form>
    </div>
  );
}
