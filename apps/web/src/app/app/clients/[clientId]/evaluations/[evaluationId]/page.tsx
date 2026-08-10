"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { EvaluationEditor } from "@/components/app/evaluation-editor";
import { apiFetch, type ClientEvaluation } from "@/lib/api";

export default function EditEvaluationPage() {
  const params = useParams<{ clientId: string; evaluationId: string }>();
  const [item, setItem] = useState<ClientEvaluation | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await apiFetch<ClientEvaluation>(
        `/api/v1/evaluations/${params.evaluationId}`,
      );
      if (cancelled) return;
      if (result.error) {
        setError(result.error.message);
        return;
      }
      setItem(result.data ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [params.evaluationId]);

  if (error) {
    return (
      <p role="alert" className="text-sm text-[var(--color-danger)]">
        {error}
      </p>
    );
  }
  if (!item) {
    return <p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p>;
  }
  return (
    <EvaluationEditor
      clientId={params.clientId}
      evaluationId={params.evaluationId}
      initial={item}
    />
  );
}
