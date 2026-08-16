"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BackLink } from "@/components/app/back-link";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { useAuth } from "@/components/auth/auth-provider";
import { apiFetch, type CycleTemplate, type Service } from "@/lib/api";
import { safeReturnTo } from "@/lib/nomenclature";
import { SETUP_CELEBRATE_KEY, setupCopyFor } from "@/lib/setup-copy";

const FREQ_PRESETS = [1, 2, 3, 4, 5];

function NewCycleTemplateForm() {
  const router = useRouter();
  const search = useSearchParams();
  const { me } = useAuth();
  const copy = setupCopyFor(me?.organization.profession_code);
  const returnTo = safeReturnTo(search.get("returnTo")) ?? "/app/cycle-templates";
  const [services, setServices] = useState<Service[] | null>(null);
  const [name, setName] = useState("");
  const [weeklyFrequency, setWeeklyFrequency] = useState("2");
  const [customFreq, setCustomFreq] = useState(false);
  const [durationType, setDurationType] = useState<"calendar_months" | "fixed_days">(
    "calendar_months",
  );
  const [durationValue, setDurationValue] = useState("1");
  const [periodPreset, setPeriodPreset] = useState<"month" | "4w" | "8w" | "custom">("month");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const result = await apiFetch<Service[]>("/api/v1/services?status=active");
      setServices(result.data ?? []);
    })();
  }, []);

  function applyPeriod(preset: typeof periodPreset) {
    setPeriodPreset(preset);
    if (preset === "month") {
      setDurationType("calendar_months");
      setDurationValue("1");
    } else if (preset === "4w") {
      setDurationType("fixed_days");
      setDurationValue("28");
    } else if (preset === "8w") {
      setDurationType("fixed_days");
      setDurationValue("56");
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    const frequency = Number.parseInt(weeklyFrequency.trim(), 10);
    const duration = Number.parseInt(durationValue.trim(), 10);
    if (!Number.isFinite(frequency) || frequency < 1 || frequency > 7) {
      setSaving(false);
      setError("Informe a frequência semanal entre 1 e 7.");
      return;
    }
    if (!Number.isFinite(duration) || duration < 1 || duration > 730) {
      setSaving(false);
      setError("Informe uma duração válida (1 a 730).");
      return;
    }
    const result = await apiFetch<CycleTemplate>("/api/v1/cycle-templates", {
      method: "POST",
      body: JSON.stringify({
        name,
        weekly_frequency: frequency,
        duration_type: durationType,
        duration_value: duration,
      }),
    });
    setSaving(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    if (returnTo === "/app" || returnTo === "/app/setup") {
      try {
        sessionStorage.setItem(SETUP_CELEBRATE_KEY, "1");
      } catch {
        /* ignore */
      }
    }
    router.replace(returnTo);
  }

  const hasService = (services ?? []).length > 0;
  const loadingServices = services === null;

  return (
    <div className="space-y-4 animate-fade-up">
      <BackLink href={returnTo} label="Voltar" />
      <h1 className="h-display text-3xl text-[var(--color-ink)]">Novo modelo</h1>
      <p className="text-sm text-[var(--color-ink-muted)]">
        O modelo é reutilizável. O ciclo real de um cliente é criado depois, com o serviço escolhido
        na hora.
      </p>
      {!loadingServices && !hasService ? (
        <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-3">
          <p className="text-sm font-semibold text-[var(--color-ink)]">
            Crie um serviço primeiro para continuar
          </p>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            O modelo define frequência e período. O serviço informa o que será oferecido.
          </p>
          <Link
            href={`/app/services/new?returnTo=${encodeURIComponent(`/app/cycle-templates/new?returnTo=${returnTo}`)}`}
            className="mt-2 inline-block text-sm font-semibold text-[var(--color-primary)]"
          >
            Criar serviço
          </Link>
        </div>
      ) : null}
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <TextField
          label="Nome"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={copy.templateNamePlaceholder}
          required
        />
        <fieldset>
          <legend className="text-sm font-medium">Frequência</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {FREQ_PRESETS.map((n) => (
              <button
                key={n}
                type="button"
                className={`min-h-10 rounded-[var(--radius-md)] border px-3 text-sm font-semibold ${
                  !customFreq && weeklyFrequency === String(n)
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                    : "border-[var(--color-border)] bg-[var(--color-surface)]"
                }`}
                onClick={() => {
                  setCustomFreq(false);
                  setWeeklyFrequency(String(n));
                }}
              >
                {n}× por semana
              </button>
            ))}
            <button
              type="button"
              className={`min-h-10 rounded-[var(--radius-md)] border px-3 text-sm font-semibold ${
                customFreq
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                  : "border-[var(--color-border)] bg-[var(--color-surface)]"
              }`}
              onClick={() => setCustomFreq(true)}
            >
              Personalizar
            </button>
          </div>
          {customFreq ? (
            <div className="mt-2">
              <TextField
                label="Aulas por semana (1 a 7)"
                inputMode="numeric"
                value={weeklyFrequency}
                onChange={(e) => setWeeklyFrequency(e.target.value)}
                required
              />
            </div>
          ) : null}
        </fieldset>
        <fieldset>
          <legend className="text-sm font-medium">Período</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {(
              [
                ["month", "Mensal"],
                ["4w", "4 semanas"],
                ["8w", "8 semanas"],
                ["custom", "Personalizado"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`min-h-10 rounded-[var(--radius-md)] border px-3 text-sm font-semibold ${
                  periodPreset === key
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                    : "border-[var(--color-border)] bg-[var(--color-surface)]"
                }`}
                onClick={() => applyPeriod(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>
        {periodPreset === "custom" ? (
          <>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Tipo de duração</span>
              <select
                className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
                value={durationType}
                onChange={(e) =>
                  setDurationType(e.target.value as "calendar_months" | "fixed_days")
                }
              >
                <option value="calendar_months">Meses do calendário</option>
                <option value="fixed_days">Dias corridos</option>
              </select>
            </label>
            <TextField
              label={durationType === "calendar_months" ? "Quantidade de meses" : "Quantidade de dias"}
              inputMode="numeric"
              value={durationValue}
              onChange={(e) => setDurationValue(e.target.value)}
              required
            />
          </>
        ) : null}
        <p className="text-sm text-[var(--color-ink-muted)]">
          {copy.templateExample} O modelo não altera ciclos já criados.
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

export default function NewCycleTemplatePage() {
  return (
    <Suspense fallback={<p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p>}>
      <NewCycleTemplateForm />
    </Suspense>
  );
}
