"use client";

import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { EvaluationEditor } from "@/components/app/evaluation-editor";

function NewEvaluationPageInner() {
  const params = useParams<{ clientId: string }>();
  const searchParams = useSearchParams();
  return (
    <EvaluationEditor
      clientId={params.clientId}
      returnTo={searchParams.get("returnTo") || undefined}
      occurrenceId={searchParams.get("occurrenceId") || undefined}
    />
  );
}

export default function NewEvaluationPage() {
  return (
    <Suspense fallback={null}>
      <NewEvaluationPageInner />
    </Suspense>
  );
}
