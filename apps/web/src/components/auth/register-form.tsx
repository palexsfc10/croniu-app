"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiFetch, type MeResponse } from "@/lib/api";
import { registerSchema, type RegisterValues } from "@/lib/validators";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import {
  PROFESSION_OPTIONS,
  SPORTS_SPECIALTIES,
  TUTOR_SPECIALTIES,
  USE_CASE_OPTIONS,
  recommendedFormLabel,
  registerSummaryLines,
} from "@/lib/nomenclature";

function valuesFromForm(form: HTMLFormElement): Pick<
  RegisterValues,
  "full_name" | "organization_name" | "email" | "password"
> {
  const data = new FormData(form);
  return {
    full_name: String(data.get("full_name") ?? ""),
    organization_name: String(data.get("organization_name") ?? ""),
    email: String(data.get("email") ?? ""),
    password: String(data.get("password") ?? ""),
  };
}

type RegisterResult = MeResponse & {
  requires_email_verification?: boolean;
  message?: string | null;
};

export function RegisterForm() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      full_name: "",
      organization_name: "",
      email: "",
      password: "",
      profession_code: "",
      profession_specialty: "",
      profession_other: "",
      use_cases: [],
    },
  });

  const profession = watch("profession_code");
  const specialty = watch("profession_specialty");
  const useCases = watch("use_cases") ?? [];

  function toggleUseCase(code: string) {
    const next = useCases.includes(code)
      ? useCases.filter((item) => item !== code)
      : [...useCases, code];
    setValue("use_cases", next, { shouldValidate: false });
  }

  function goNext() {
    const synced = {
      full_name: getValues("full_name"),
      organization_name: getValues("organization_name"),
      email: getValues("email"),
      password: getValues("password"),
    };
    if (synced.full_name.trim().length < 2) {
      setFormError("Informe seu nome.");
      return;
    }
    if (synced.organization_name.trim().length < 2) {
      setFormError("Informe o nome do negócio.");
      return;
    }
    if (!synced.email.includes("@")) {
      setFormError("E-mail inválido.");
      return;
    }
    if (synced.password.length < 8) {
      setFormError("A senha deve ter pelo menos 8 caracteres.");
      return;
    }
    setFormError(null);
    setStep(2);
  }

  const onSubmit = handleSubmit(async (values) => {
    if (step !== 2) {
      goNext();
      return;
    }
    setFormError(null);
    const result = await apiFetch<RegisterResult>("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({
        full_name: values.full_name,
        organization_name: values.organization_name,
        email: values.email,
        password: values.password,
        profession_code: values.profession_code,
        profession_specialty: values.profession_specialty || null,
        profession_other: values.profession_other || null,
        use_cases: values.use_cases?.length ? values.use_cases : null,
      }),
    });
    if (result.error) {
      setFormError(result.error.message);
      return;
    }
    if (result.data?.requires_email_verification) {
      setPendingEmail(values.email);
      return;
    }
    router.replace("/app");
    router.refresh();
  });

  async function resendVerification() {
    const email = pendingEmail || getValues("email");
    if (!email) return;
    setFormError(null);
    const result = await apiFetch<{ message: string }>("/api/v1/auth/email-verification/request", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    if (result.error) setFormError(result.error.message);
  }

  if (pendingEmail) {
    return (
      <div className="flex flex-1 flex-col gap-4">
        <p className="text-sm text-[var(--color-ink)]">
          Conta criada. Enviamos um link para <strong>{pendingEmail}</strong>. Confirme o e-mail
          antes de entrar no Croniu.
        </p>
        {formError ? (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {formError}
          </p>
        ) : null}
        <Button type="button" fullWidth onClick={() => void resendVerification()}>
          Reenviar e-mail
        </Button>
        <Link
          href="/login"
          className="text-center text-sm font-semibold text-[var(--color-primary)] underline-offset-2 hover:underline"
        >
          Ir para o login
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        const synced = valuesFromForm(event.currentTarget);
        setValue("full_name", synced.full_name, { shouldValidate: false });
        setValue("organization_name", synced.organization_name, { shouldValidate: false });
        setValue("email", synced.email, { shouldValidate: false });
        setValue("password", synced.password, { shouldValidate: false });
        if (step === 1) {
          event.preventDefault();
          goNext();
          return;
        }
        void onSubmit(event);
      }}
      className="flex flex-1 flex-col gap-4"
      noValidate
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
        Etapa {step} de 2 · {step === 1 ? "Seus dados" : "Seu trabalho"}
      </p>

      {step === 1 ? (
        <div className="space-y-4">
          <TextField
            label="Seu nome"
            autoComplete="name"
            autoCapitalize="words"
            enterKeyHint="next"
            error={errors.full_name?.message}
            {...register("full_name")}
          />
          <TextField
            label="Nome do negócio ou organização"
            hint="Pode ser seu nome profissional."
            autoComplete="organization"
            autoCapitalize="words"
            enterKeyHint="next"
            error={errors.organization_name?.message}
            {...register("organization_name")}
          />
          <TextField
            label="E-mail"
            type="email"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            enterKeyHint="next"
            error={errors.email?.message}
            {...register("email")}
          />
          <TextField
            label="Senha"
            type="password"
            autoComplete="new-password"
            enterKeyHint="done"
            revealable
            hint="Mínimo de 8 caracteres."
            error={errors.password?.message}
            {...register("password")}
          />
        </div>
      ) : (
        <div className="space-y-4">
          <fieldset>
            <legend className="text-sm font-medium text-[var(--color-ink)]">
              Qual é a sua área de atuação?
            </legend>
            <div className="mt-2 grid gap-2">
              {PROFESSION_OPTIONS.map((opt) => (
                <label
                  key={opt.code}
                  className={`flex min-h-11 cursor-pointer items-center rounded-[var(--radius-md)] border px-3 text-sm ${
                    profession === opt.code
                      ? "border-[var(--color-ink)] bg-[var(--color-surface-subtle)]"
                      : "border-[var(--color-border)]"
                  }`}
                >
                  <input
                    type="radio"
                    className="mr-2"
                    value={opt.code}
                    checked={profession === opt.code}
                    onChange={() => {
                      setValue("profession_code", opt.code, { shouldValidate: true });
                      setValue("profession_specialty", "");
                    }}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
            {errors.profession_code?.message ? (
              <p role="alert" className="mt-1 text-sm text-[var(--color-danger)]">
                {errors.profession_code.message}
              </p>
            ) : null}
          </fieldset>

          {profession === "sports_teacher" ? (
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">Qual é sua principal especialidade?</span>
              <select
                className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
                value={specialty || ""}
                onChange={(e) => setValue("profession_specialty", e.target.value)}
              >
                <option value="">Selecionar…</option>
                {SPORTS_SPECIALTIES.map((opt) => (
                  <option key={opt.code} value={opt.code}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {profession === "private_tutor" ? (
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">Qual é sua principal área de ensino?</span>
              <select
                className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
                value={specialty || ""}
                onChange={(e) => setValue("profession_specialty", e.target.value)}
              >
                <option value="">Selecionar…</option>
                {TUTOR_SPECIALTIES.map((opt) => (
                  <option key={opt.code} value={opt.code}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {profession === "other" || specialty === "other" ? (
            <TextField
              label={profession === "other" ? "Como você descreve sua atuação?" : "Qual especialidade?"}
              hint={profession === "other" ? "Ex.: fotógrafo, designer, massoterapeuta ou instrutor." : undefined}
              {...register("profession_other")}
            />
          ) : null}

          <fieldset>
            <legend className="text-sm font-medium">Como você acompanha seus clientes ou alunos?</legend>
            <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
              Escolha tudo o que fizer parte da sua rotina.
            </p>
            <div className="mt-2 grid gap-2">
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

          {profession ? (
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm">
              <p className="font-medium">Seu Croniu será preparado para:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--color-ink-muted)]">
                {registerSummaryLines(profession).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
                Formulário recomendado: {recommendedFormLabel(profession, specialty)}
              </p>
            </div>
          ) : null}
        </div>
      )}

      {formError ? (
        <p
          role="alert"
          className="rounded-[var(--radius-sm)] bg-[var(--color-danger-subtle)] px-3 py-2 text-sm text-[var(--color-danger)]"
        >
          {formError}
        </p>
      ) : null}

      <div className="mt-auto space-y-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {step === 1 ? (
          <Button type="submit" fullWidth>
            Continuar
          </Button>
        ) : (
          <>
            <Button type="submit" fullWidth disabled={isSubmitting}>
              {isSubmitting ? "Criando conta…" : "Criar minha conta"}
            </Button>
            <Button type="button" variant="ghost" fullWidth onClick={() => setStep(1)}>
              Voltar
            </Button>
          </>
        )}
        <p className="text-center text-sm text-[var(--color-ink-muted)]">
          Já tem conta?{" "}
          <Link
            className="font-semibold text-[var(--color-primary)] underline-offset-2 hover:underline"
            href="/login"
          >
            Entrar
          </Link>
        </p>
      </div>
    </form>
  );
}
