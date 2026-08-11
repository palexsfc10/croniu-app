"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch, type CycleTemplate } from "@/lib/api";
import { BackLink } from "@/components/app/back-link";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";

export default function EditCycleTemplatePage() {
  const params = useParams<{ templateId: string }>();
  const router = useRouter();
  const [name, setName] = useState("");
  const [weeklyFrequency, setWeeklyFrequency] = useState("");
  const [durationType, setDurationType] = useState<"calendar_months" | "fixed_days">(
    "calendar_months",
  );
  const [durationValue, setDurationValue] = useState("");
  const [status, setStatus] = useState("active");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await apiFetch<CycleTemplate>(
        `/api/v1/cycle-templates/${params.templateId}`,
      );
      if (cancelled) return;
      if (result.error) {
        setError(result.error.message);
        return;
      }
      const row = result.data;
      if (!row) return;
      setName(row.name);
      setWeeklyFrequency(String(row.weekly_frequency));
      setDurationType(
        row.duration_type === "fixed_days" ? "fixed_days" : "calendar_months",
      );
      setDurationValue(String(row.duration_value));
      setStatus(row.status);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [params.templateId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const frequency = Number.parseInt(weeklyFrequency.trim(), 10);
    const duration = Number.parseInt(durationValue.trim(), 10);
    if (!Number.isFinite(frequency) || frequency < 1 || frequency > 7) {
      setSaving(false);
      setError("Informe a frequência semanal entre 1 e 7 aulas.");
      return;
    }
    if (!Number.isFinite(duration) || duration < 1 || duration > 730) {
      setSaving(false);
      setError("Informe uma duração válida (1 a 730).");
      return;
    }

    const result = await apiFetch<CycleTemplate>(
      `/api/v1/cycle-templates/${params.templateId}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          name,
          weekly_frequency: frequency,
          duration_type: durationType,
          duration_value: duration,
        }),
      },
    );
    setSaving(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    router.replace("/app/cycle-templates");
  }

  async function archive() {
    const ok = window.confirm(
      "Excluir este modelo? Ele some da lista; ciclos já criados não mudam.",
    );
    if (!ok) return;
    setSaving(true);
    setError(null);
    const result = await apiFetch<CycleTemplate>(
      `/api/v1/cycle-templates/${params.templateId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ status: "archived" }),
      },
    );
    setSaving(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    router.replace("/app/cycle-templates");
  }

  return (
    <div className="space-y-4 animate-fade-up">
      <BackLink href="/app/cycle-templates" label="Modelos" />
      <h1 className="h-display text-3xl text-[var(--color-ink)]">Editar modelo</h1>
      <p className="text-sm text-[var(--color-ink-muted)]">
        Alterar o modelo não muda ciclos já criados.
        {status === "archived" ? " Este modelo está arquivado." : ""}
      </p>
      {!loaded && !error ? (
        <p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p>
      ) : null}
      {loaded ? (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <TextField
            label="Nome"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <TextField
            label="Frequência semanal (aulas/semana)"
            inputMode="numeric"
            autoComplete="off"
            value={weeklyFrequency}
            onChange={(e) => setWeeklyFrequency(e.target.value)}
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
            label={
              durationType === "calendar_months" ? "Quantidade de meses" : "Quantidade de dias"
            }
            inputMode="numeric"
            autoComplete="off"
            value={durationValue}
            onChange={(e) => setDurationValue(e.target.value)}
            required
          />
          {error ? (
            <p role="alert" className="text-sm text-[var(--color-danger)]">
              {error}
            </p>
          ) : null}
          <Button type="submit" fullWidth disabled={saving}>
            {saving ? "Salvando…" : "Salvar alterações"}
          </Button>
          {status === "active" ? (
            <Button
              type="button"
              fullWidth
              disabled={saving}
              onClick={() => void archive()}
            >
              Excluir modelo
            </Button>
          ) : null}
        </form>
      ) : error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
