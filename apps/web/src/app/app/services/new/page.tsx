"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BackLink } from "@/components/app/back-link";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { useAuth } from "@/components/auth/auth-provider";
import { apiFetch, reaisToCents, type CycleTemplate, type Service } from "@/lib/api";
import { safeReturnTo } from "@/lib/nomenclature";
import { SETUP_CELEBRATE_KEY, setupCopyFor } from "@/lib/setup-copy";

const DURATION_PRESETS = [
  { label: "30 min", minutes: 30 },
  { label: "45 min", minutes: 45 },
  { label: "1 hora", minutes: 60 },
  { label: "1h30", minutes: 90 },
];

function NewServiceForm() {
  const router = useRouter();
  const search = useSearchParams();
  const { me } = useAuth();
  const copy = setupCopyFor(me?.organization.profession_code);
  const returnTo = safeReturnTo(search.get("returnTo")) ?? "/app/services";
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priceReais, setPriceReais] = useState("");
  const [free, setFree] = useState(false);
  const [minutes, setMinutes] = useState(60);
  const [customDuration, setCustomDuration] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const presetActive = useMemo(
    () => DURATION_PRESETS.some((p) => p.minutes === minutes && !customDuration),
    [minutes, customDuration],
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    let cents: number | null = null;
    if (free) {
      cents = 0;
    } else if (priceReais.trim()) {
      cents = reaisToCents(priceReais);
      if (cents == null) {
        setSaving(false);
        setError("Informe um valor válido ou deixe em branco.");
        return;
      }
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
    if (result.error) {
      setSaving(false);
      setError(result.error.message);
      return;
    }
    if (returnTo === "/app" || returnTo === "/app/setup") {
      const templates = await apiFetch<CycleTemplate[]>("/api/v1/cycle-templates?status=active");
      if (!(templates.data ?? []).length) {
        router.replace(`/app/cycle-templates/new?returnTo=${encodeURIComponent(returnTo)}`);
        return;
      }
      try {
        sessionStorage.setItem(SETUP_CELEBRATE_KEY, "1");
      } catch {
        /* ignore */
      }
    }
    setSaving(false);
    router.replace(returnTo);
  }

  return (
    <div className="space-y-4 animate-fade-up">
      <BackLink href={returnTo} label="Voltar" />
      <h1 className="h-display text-3xl text-[var(--color-ink)]">Novo serviço</h1>
      <p className="text-sm text-[var(--color-ink-muted)]">
        O serviço descreve o que você oferece. O valor não é preenchido automaticamente.
      </p>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <TextField
          label="Nome"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={copy.serviceNamePlaceholder}
          required
        />
        <TextField
          label="Descrição (opcional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <fieldset>
          <legend className="text-sm font-medium">Duração</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {DURATION_PRESETS.map((p) => {
              const active = !customDuration && minutes === p.minutes;
              return (
                <button
                  key={p.minutes}
                  type="button"
                  className={`min-h-10 rounded-[var(--radius-md)] border px-3 text-sm font-semibold ${
                    active
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                      : "border-[var(--color-border)] bg-[var(--color-surface)]"
                  }`}
                  onClick={() => {
                    setCustomDuration(false);
                    setMinutes(p.minutes);
                  }}
                >
                  {p.label}
                </button>
              );
            })}
            <button
              type="button"
              className={`min-h-10 rounded-[var(--radius-md)] border px-3 text-sm font-semibold ${
                customDuration || !presetActive
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                  : "border-[var(--color-border)] bg-[var(--color-surface)]"
              }`}
              onClick={() => setCustomDuration(true)}
            >
              Personalizar
            </button>
          </div>
          {customDuration ? (
            <div className="mt-2">
              <TextField
                label="Duração (minutos)"
                type="number"
                value={String(minutes)}
                onChange={(e) => setMinutes(Number(e.target.value) || 60)}
                required
              />
            </div>
          ) : null}
        </fieldset>
        <label className="flex items-center gap-2 text-sm text-[var(--color-ink)]">
          <input
            type="checkbox"
            checked={free}
            onChange={(e) => setFree(e.target.checked)}
          />
          Gratuito
        </label>
        {!free ? (
          <TextField
            label="Valor (R$)"
            inputMode="decimal"
            value={priceReais}
            onChange={(e) => setPriceReais(e.target.value)}
            placeholder="0,00"
            hint="Informe o valor cobrado por atendimento. Deixe em branco se o valor for definido no ciclo."
          />
        ) : null}
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

export default function NewServicePage() {
  return (
    <Suspense fallback={<p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p>}>
      <NewServiceForm />
    </Suspense>
  );
}
