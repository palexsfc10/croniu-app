"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";

function VerifyEmailFormInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

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
      return;
    }
    setDone(true);
    window.setTimeout(() => {
      router.replace("/app");
      router.refresh();
    }, 1200);
  }

  if (!token) {
    return (
      <div className="space-y-4">
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          Link de verificação ausente ou incompleto.
        </p>
        <Link
          href="/login"
          className="inline-flex text-sm font-semibold text-[var(--color-primary)] underline-offset-2 hover:underline"
        >
          Ir para o login
        </Link>
      </div>
    );
  }

  if (done) {
    return <p className="text-sm text-[var(--color-ink-muted)]">E-mail confirmado. Redirecionando…</p>;
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      {formError ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {formError}
        </p>
      ) : null}
      <Button type="button" onClick={confirm} disabled={busy}>
        {busy ? "Confirmando…" : "Confirmar e-mail"}
      </Button>
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
