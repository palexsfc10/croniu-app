"use client";

import { EvaluationEditor } from "@/components/app/evaluation-editor";
import { useParams } from "next/navigation";

export default function NewEvaluationPage() {
  const params = useParams<{ clientId: string }>();
  return <EvaluationEditor clientId={params.clientId} />;
}
