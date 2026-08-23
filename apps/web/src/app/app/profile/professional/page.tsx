"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, type ProfessionProfile } from "@/lib/api";
import {
  PROFESSION_OPTIONS,
  SPORTS_SPECIALTIES,
  TUTOR_SPECIALTIES,
  USE_CASE_OPTIONS,
  recommendedFormLabel,
} from "@/lib/nomenclature";
import { BackLink } from "@/components/app/back-link";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";

export default function ProfessionalProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfessionProfile | null>(null);
  const [code, setCode] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [other, setOther] = useState("");
  const [useCases, setUseCases] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const result = await apiFetch<ProfessionProfile>("/api/v1/organization/profession");
      if (result.error) {
        setError(result.error.message);
        return;
      }
      const data = result.data;
      if (!data) return;
      setProfile(data);
      setCode(data.profession_code ?? "");
      setSpecialty(data.profession_specialty ?? "");
      setOther(data.profession_other ?? "");
      setUseCases(data.use_cases ?? []);
    })();
  }, []);

  function toggleUseCase(value: string) {
    setUseCases((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }

  async function save() {
    setBusy(true);
    setError(null);
    setInfo(null);
    const result = await apiFetch<ProfessionProfile>("/api/v1/organization/profession", {
      method: "PATCH",
      body: JSON.stringify({
        profession_code: code || null,
        profession_specialty: specialty || null,
        profession_other: other || null,
        use_cases: useCases,
        profession_onboarding_done: true,
      }),
    });
    if (result.error) {
      setBusy(false);
      setError(result.error.message);
      return;
    }
    setProfile(result.data ?? null);
    setInfo("Perfil profissional atualizado. Dados históricos foram preservados.");
    // Saving completes this step — don't strand the user on the form. Keep
    // the button disabled (busy stays true) through the redirect so a
    // second click can't fire a duplicate PATCH in this window. Brief
    // pause so the confirmation above is actually readable before leaving
    // — matches how the 2-step register flow finishes.
    setTimeout(() => {
      router.push("/app");
      router.refresh();
    }, 900);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 animate-fade-up">
      <BackLink href="/app/profile" label="Mais" />
      <header className="space-y-1">
        <h1 className="h-display text-3xl text-[var(--color-ink)]">Perfil profissional</h1>
        <p className="text-sm text-[var(--color-ink-muted)]">
          Usamos sua área para recomendar formulários e adaptar a linguagem — sem bloquear
          recursos.
        </p>
      </header>
      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
      {info ? (
        <p role="status" className="text-sm text-[var(--color-success)]">
          {info}
        </p>
      ) : null}

      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Qual é a sua área de atuação?</span>
        <select
          className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setSpecialty("");
          }}
        >
          <option value="">Selecionar…</option>
          {PROFESSION_OPTIONS.map((opt) => (
            <option key={opt.code} value={opt.code}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      {code === "sports_teacher" ? (
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Especialidade (opcional)</span>
          <select
            className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
            value={specialty}
            onChange={(e) => setSpecialty(e.target.value)}
          >
            <option value="">—</option>
            {SPORTS_SPECIALTIES.map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {code === "private_tutor" ? (
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Área (opcional)</span>
          <select
            className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
            value={specialty}
            onChange={(e) => setSpecialty(e.target.value)}
          >
            <option value="">—</option>
            {TUTOR_SPECIALTIES.map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {code === "other" ? (
        <TextField
          label="Como você descreve sua atuação?"
          value={other}
          onChange={(e) => setOther(e.target.value)}
        />
      ) : null}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">
          Como você acompanha seus clientes ou alunos?
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {USE_CASE_OPTIONS.map((opt) => (
            <label
              key={opt.code}
              className="flex min-h-11 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-sm"
            >
              <input
                type="checkbox"
                checked={useCases.includes(opt.code)}
                onChange={() => toggleUseCase(opt.code)}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </fieldset>

      {code ? (
        <p className="text-sm text-[var(--color-ink-muted)]">
          Formulário recomendado para novos links:{" "}
          <strong>{recommendedFormLabel(code, specialty)}</strong>
          {profile?.recommended_form_kind
            ? ` (atual no servidor: ${profile.recommended_form_kind})`
            : ""}
          .
        </p>
      ) : null}

      <Button fullWidth disabled={busy || !code} onClick={() => void save()}>
        Salvar perfil
      </Button>
    </div>
  );
}
