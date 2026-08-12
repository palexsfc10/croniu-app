"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";

function ResendVerificationPanel() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setBusy(true);
    const result = await apiFetch<{ message: string }>("/api/v1/auth/email-verification/request", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setMessage(
      result.data?.message ||
        "Se existir uma conta com este e-mail, enviaremos instruções de verificação.",
    );
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="flex flex-1 flex-col gap-4">
      <p className="text-sm text-[var(--color-ink-muted)]">
        Informe o e-mail da conta para receber um novo link de verificação.
      </p>
      <TextField
        label="E-mail"
        type="email"
        autoComplete="email"
        inputMode="email"
        autoCapitalize="none"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />
      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="text-sm text-[var(--color-ink)]">
          {message}
        </p>
      ) : null}
      <Button type="submit" disabled={busy || !email.trim()}>
        {busy ? "Enviando…" : "Reenviar e-mail de verificação"}
      </Button>
      <Link
        href="/login"
        className="text-center text-sm font-semibold text-[var(--color-primary)] underline-offset-2 hover:underline"
      >
        Voltar ao login
      </Link>
    </form>
  );
}

function VerifyEmailFormInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  async function confirm() {
    setFormError(null);
    if (!token) {
      setFormError("Link inválido. Solicite uma nova verificação.");
      return;
    }
    setBusy(true);
    const result = await apiFetch<{ message: string }>("/api/v1/auth/email-verification/confirm", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
    setBusy(false);
    if (result.error) {
      setFormError(result.error.message);
      setDone(false);
      return;
    }
    // Success only after 2xx + parsed body without error.
    setDone(true);
    window.setTimeout(() => {
      router.replace("/login?verified=1");
      router.refresh();
    }, 900);
  }

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    void confirm();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per token mount
  }, [token]);

  if (!token) {
    return <ResendVerificationPanel />;
  }

  if (done) {
    return (
      <p className="text-sm text-[var(--color-ink-muted)]" role="status">
        E-mail confirmado. Redirecionando para o login…
      </p>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      {formError ? (
        <div className="space-y-3">
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {formError}
          </p>
          <Link
            href="/login"
            className="inline-flex text-sm font-semibold text-[var(--color-primary)] underline-offset-2 hover:underline"
          >
            Voltar ao login para reenviar a verificação
          </Link>
        </div>
      ) : (
        <p className="text-sm text-[var(--color-ink-muted)]" role="status">
          {busy ? "Confirmando seu e-mail…" : "Preparando confirmação…"}
        </p>
      )}
      {formError ? (
        <Button type="button" onClick={() => void confirm()} disabled={busy}>
          {busy ? "Confirmando…" : "Tentar novamente"}
        </Button>
      ) : null}
    </div>
  );
}

export function VerifyEmailForm() {
  return (
    <Suspense fallback={<p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p>}>
      <VerifyEmailFormInner />
    </Suspense>
  );
}
