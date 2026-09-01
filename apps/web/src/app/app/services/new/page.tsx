"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BackLink } from "@/components/app/back-link";
import { Button } from "@/components/ui/button";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { TextField } from "@/components/ui/text-field";
import { useAuth } from "@/components/auth/auth-provider";
import { apiFetch, reaisToCents, type CycleTemplate, type PricingMode, type Service } from "@/lib/api";
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
  const [pricingMode, setPricingMode] = useState<PricingMode>("per_lesson");
  const [priceReais, setPriceReais] = useState("");
  const [fixedPriceReais, setFixedPriceReais] = useState("");
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
    let fixedCents: number | null = null;
    if (pricingMode === "fixed_period") {
      fixedCents = reaisToCents(fixedPriceReais);
      if (fixedCents == null) {
        setSaving(false);
        setError("Informe o valor do plano.");
        return;
      }
    } else if (free) {
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
        pricing_mode: pricingMode,
        fixed_price_cents: fixedCents,
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
            {DURATION_PRESETS.map((p) => (
              <SegmentedToggle
                key={p.minutes}
                active={!customDuration && minutes === p.minutes}
                onClick={() => {
                  setCustomDuration(false);
                  setMinutes(p.minutes);
                }}
              >
                {p.label}
              </SegmentedToggle>
            ))}
            <SegmentedToggle
              active={customDuration || !presetActive}
              onClick={() => setCustomDuration(true)}
            >
              Personalizar
            </SegmentedToggle>
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
        <fieldset>
          <legend className="text-sm font-medium">Como você cobra por este serviço?</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            <SegmentedToggle
              active={pricingMode === "per_lesson"}
              onClick={() => setPricingMode("per_lesson")}
            >
              Por aula
            </SegmentedToggle>
            <SegmentedToggle
              active={pricingMode === "fixed_period"}
              onClick={() => setPricingMode("fixed_period")}
            >
              Valor fixo pelo período
            </SegmentedToggle>
          </div>
        </fieldset>
        {pricingMode === "fixed_period" ? (
          <TextField
            label="Valor do plano (R$)"
            inputMode="decimal"
            value={fixedPriceReais}
            onChange={(e) => setFixedPriceReais(e.target.value)}
            placeholder="0,00"
            hint="Valor cobrado pelo período inteiro do plano, independente da quantidade de aulas."
            required
          />
        ) : (
          <>
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
                label="Valor por aula (R$)"
                inputMode="decimal"
                value={priceReais}
                onChange={(e) => setPriceReais(e.target.value)}
                placeholder="0,00"
                hint="Informe o valor cobrado por atendimento. Deixe em branco se o valor for definido no ciclo."
              />
            ) : null}
          </>
        )}
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
