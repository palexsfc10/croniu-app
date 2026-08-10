"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FormEvent, useId, useRef, useState } from "react";
import { BackLink } from "@/components/app/back-link";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/text-area";
import { TextField } from "@/components/ui/text-field";
import { apiFetch } from "@/lib/api";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_MESSAGE_MIN,
  FEEDBACK_SUBJECT_MAX,
  buildTechnicalContext,
  type FeedbackCategoryValue,
} from "@/lib/feedback";

const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || "0.0.0-dev";
const gitSha = process.env.NEXT_PUBLIC_GIT_SHA || "unknown";

export default function HelpFeedbackPage() {
  const pathname = usePathname();
  const formId = useId();
  const successRef = useRef<HTMLParagraphElement>(null);
  const [category, setCategory] = useState<FeedbackCategoryValue | "">("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [includeTech, setIncludeTech] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ category?: string; message?: string }>({});
  const [sent, setSent] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const nextErrors: { category?: string; message?: string } = {};
    if (!category) nextErrors.category = "Escolha um tipo.";
    const trimmed = message.trim();
    if (trimmed.length < FEEDBACK_MESSAGE_MIN) {
      nextErrors.message = `Escreva pelo menos ${FEEDBACK_MESSAGE_MIN} caracteres.`;
    }
    if (trimmed.length > FEEDBACK_MESSAGE_MAX) {
      nextErrors.message = `Máximo de ${FEEDBACK_MESSAGE_MAX} caracteres.`;
    }
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = {
      category,
      subject: subject.trim() || null,
      message: trimmed,
      include_technical_context: includeTech,
    };
    if (includeTech) {
      body.technical_context = buildTechnicalContext(pathname);
    }
    const result = await apiFetch<{ id: string }>("/api/v1/feedback", {
      method: "POST",
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (result.error) {
      setError("Não foi possível enviar agora. Tente novamente em alguns instantes.");
      return;
    }
    setSent(true);
    setCategory("");
    setSubject("");
    setMessage("");
    setIncludeTech(false);
    requestAnimationFrame(() => successRef.current?.focus());
  }

  return (
    <div className="mx-auto max-w-lg space-y-5 animate-fade-up">
      <BackLink href="/app/profile" label="Mais" />
      <div>
        <h1 className="h-display text-3xl text-[var(--color-ink)]">Ajuda e feedback</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Consulte o manual ou envie uma mensagem para a equipe do Croniu.
        </p>
      </div>

      <Link
        href="/app/manual"
        className="flex min-h-12 items-center justify-between rounded-[var(--radius-lg)] border border-[var(--color-border)]/80 bg-[var(--color-surface)] px-3.5 py-2.5 text-sm font-semibold text-[var(--color-ink)] transition-colors hover:bg-[var(--color-surface-subtle)]"
      >
        Abrir manual rápido
        <span className="text-[var(--color-ink-muted)]" aria-hidden>
          →
        </span>
      </Link>

      {sent ? (
        <p
          ref={successRef}
          tabIndex={-1}
          role="status"
          className="rounded-[var(--radius-md)] bg-[var(--color-success-subtle)] px-3.5 py-3 text-sm font-medium text-[var(--color-success)]"
        >
          Feedback enviado. Obrigado por ajudar a melhorar o Croniu.
        </p>
      ) : null}

      <form
        id={formId}
        onSubmit={(e) => void onSubmit(e)}
        className="space-y-4 rounded-[var(--radius-lg)] border border-[var(--color-border)]/80 bg-[var(--color-surface)] p-4"
        noValidate
      >
        <p className="text-sm text-[var(--color-ink-muted)]">
          Seu feedback será enviado para a equipe do Croniu.
        </p>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-[var(--color-ink)]">Tipo</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {FEEDBACK_CATEGORIES.map((item) => {
              const selected = category === item.value;
              return (
                <label
                  key={item.value}
                  className={[
                    "flex min-h-11 cursor-pointer items-center justify-center rounded-[var(--radius-md)] border px-2 text-center text-sm font-semibold transition-colors",
                    selected
                      ? "border-[var(--color-primary)] bg-[var(--color-primary-subtle)] text-[var(--color-primary)]"
                      : "border-[var(--color-border)] text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-subtle)]",
                  ].join(" ")}
                >
                  <input
                    type="radio"
                    name="feedback-category"
                    value={item.value}
                    checked={selected}
                    onChange={() => setCategory(item.value)}
                    className="sr-only"
                  />
                  {item.label}
                </label>
              );
            })}
          </div>
          {fieldErrors.category ? (
            <p className="text-xs text-[var(--color-danger)]" role="alert">
              {fieldErrors.category}
            </p>
          ) : null}
        </fieldset>

        <TextField
          label="Assunto (opcional)"
          value={subject}
          maxLength={FEEDBACK_SUBJECT_MAX}
          onChange={(e) => setSubject(e.target.value)}
        />

        <div className="space-y-1.5">
          <TextArea
            label="Mensagem"
            value={message}
            maxLength={FEEDBACK_MESSAGE_MAX}
            rows={5}
            required
            error={fieldErrors.message}
            hint={`${message.trim().length}/${FEEDBACK_MESSAGE_MAX}`}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>

        <label className="flex items-start gap-2.5 text-sm text-[var(--color-ink-muted)]">
          <input
            type="checkbox"
            checked={includeTech}
            onChange={(e) => setIncludeTech(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-[var(--color-border)]"
          />
          <span>
            Autorizar o envio de informações técnicas para diagnóstico
            <span className="mt-0.5 block text-xs">
              Inclui rota atual, versão, tipo de dispositivo e tamanho da tela — sem senhas ou dados
              de clientes.
            </span>
          </span>
        </label>

        {error ? (
          <p className="text-sm text-[var(--color-danger)]" role="alert">
            {error}
          </p>
        ) : null}

        <Button type="submit" fullWidth disabled={busy}>
          {busy ? "Enviando…" : "Enviar feedback"}
        </Button>
      </form>
      <p className="text-center text-xs text-[var(--color-ink-muted)]">
        Versão {appVersion} · {gitSha.slice(0, 12)}
      </p>
    </div>
  );
}
