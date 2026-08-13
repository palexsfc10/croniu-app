"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, type IntakeSubmissionDetail } from "@/lib/api";
import { CONSENT_LABELS_PT, submissionStatusLabel } from "@/lib/intake";
import { AnamnesisReader } from "@/components/app/anamnesis-reader";
import { BackLink } from "@/components/app/back-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/text-area";

export default function IntakeSubmissionDetailPage() {
  const params = useParams<{ submissionId: string }>();
  const router = useRouter();
  const [item, setItem] = useState<IntakeSubmissionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [messageToClient, setMessageToClient] = useState("");
  const [internalReason, setInternalReason] = useState("");
  const [approvedJustNow, setApprovedJustNow] = useState(false);

  const load = useCallback(async () => {
    const result = await apiFetch<IntakeSubmissionDetail>(
      `/api/v1/intake-submissions/${params.submissionId}`,
    );
    if (result.error) {
      setError(result.error.message);
      setItem(null);
      return;
    }
    setItem(result.data ?? null);
  }, [params.submissionId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await load();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function postAction(
    path: string,
    body: Record<string, unknown>,
    okMessage: string,
  ) {
    setBusy(true);
    setError(null);
    setInfo(null);
    const result = await apiFetch<IntakeSubmissionDetail>(path, {
      method: "POST",
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setItem(result.data ?? null);
    setInfo(okMessage);
    if (path.endsWith("/approve")) {
      setApprovedJustNow(true);
    }
  }

  const pending = item?.status === "pending_review";
  const snapshot = item?.anamnesis?.questions_snapshot ?? [];

  return (
    <div className="space-y-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] animate-fade-up">
      <BackLink href="/app/clients/intake" label="Novos alunos" />
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

      {!item ? (
        <p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="h-display text-3xl text-[var(--color-ink)]">{item.full_name}</h1>
            <Badge tone={pending ? "warning" : "neutral"}>
              {submissionStatusLabel(item.status)}
            </Badge>
            {item.requires_professional_attention ? (
              <Badge tone="warning">Atenção</Badge>
            ) : null}
            {item.duplicate_alert ? <Badge tone="info">Duplicata</Badge> : null}
          </div>

          {(pending || approvedJustNow) && (
            <section className="sticky top-0 z-10 space-y-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-sm">
              {approvedJustNow && item.status === "approved" ? (
                <>
                  <p className="text-sm font-medium text-[var(--color-ink)]">
                    Aluno aprovado. Vamos preparar o acompanhamento?
                  </p>
                  {item.client_id ? (
                    <Link href={`/app/clients/${item.client_id}/accompaniment`}>
                      <Button fullWidth>Preparar acompanhamento</Button>
                    </Link>
                  ) : null}
                </>
              ) : pending ? (
                <>
                  <h2 className="text-base font-semibold">Decisão</h2>
                  <TextArea
                    label="Mensagem ao aluno (opcional na aprovação)"
                    value={messageToClient}
                    onChange={(e) => setMessageToClient(e.target.value)}
                    rows={2}
                  />
                  <Button
                    fullWidth
                    disabled={busy}
                    onClick={() =>
                      void postAction(
                        `/api/v1/intake-submissions/${item.id}/approve`,
                        { message_to_client: messageToClient.trim() || null },
                        "Cadastro aprovado.",
                      )
                    }
                  >
                    Aprovar
                  </Button>
                  <Button
                    fullWidth
                    variant="secondary"
                    disabled={busy || !messageToClient.trim()}
                    onClick={() =>
                      void postAction(
                        `/api/v1/intake-submissions/${item.id}/request-changes`,
                        { message_to_client: messageToClient.trim() },
                        "Ajustes solicitados ao aluno.",
                      )
                    }
                  >
                    Solicitar ajuste
                  </Button>
                  <TextArea
                    label="Motivo interno (recusa)"
                    value={internalReason}
                    onChange={(e) => setInternalReason(e.target.value)}
                    rows={2}
                    hint="Não é enviado ao aluno."
                  />
                  <Button
                    fullWidth
                    variant="danger"
                    disabled={busy}
                    onClick={() => {
                      if (!window.confirm("Recusar este cadastro?")) return;
                      void postAction(
                        `/api/v1/intake-submissions/${item.id}/reject`,
                        {
                          rejection_internal_reason: internalReason.trim() || null,
                          message_to_client: messageToClient.trim() || null,
                        },
                        "Cadastro recusado.",
                      );
                    }}
                  >
                    Recusar
                  </Button>
                </>
              ) : null}
            </section>
          )}

          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-[var(--color-ink-muted)]">Telefone</dt>
              <dd>{item.phone_normalized || "—"}</dd>
            </div>
            <div>
              <dt className="text-[var(--color-ink-muted)]">E-mail</dt>
              <dd>{item.email || "—"}</dd>
            </div>
            <div>
              <dt className="text-[var(--color-ink-muted)]">Objetivo</dt>
              <dd>{item.primary_goal}</dd>
            </div>
            <div>
              <dt className="text-[var(--color-ink-muted)]">Emergência</dt>
              <dd>{item.emergency_contact || "—"}</dd>
            </div>
          </dl>

          {item.anamnesis ? (
            <AnamnesisReader
              formName={item.anamnesis.form_name}
              submittedAt={item.submitted_at}
              versionNumber={item.anamnesis.template_version_number}
              statusLabel={submissionStatusLabel(item.status)}
              requiresAttention={item.anamnesis.requires_professional_attention}
              summary={item.anamnesis.summary}
              questions={snapshot}
            />
          ) : null}

          {item.consents?.length ? (
            <section className="space-y-2">
              <h2 className="text-base font-semibold">Consentimentos</h2>
              <ul className="space-y-1 text-sm">
                {item.consents.map((c) => (
                  <li key={c.consent_key} className="flex justify-between gap-2">
                    <span>{CONSENT_LABELS_PT[c.consent_key] ?? c.consent_key}</span>
                    <Badge tone={c.accepted ? "success" : "neutral"}>
                      {c.accepted ? "Aceito" : "Não"}
                    </Badge>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {item.client_id && item.status === "approved" && !approvedJustNow ? (
            <Link href={`/app/clients/${item.client_id}/accompaniment`} className="block">
              <Button fullWidth>Preparar acompanhamento</Button>
            </Link>
          ) : null}

          {item.client_id ? (
            <Link href={`/app/clients/${item.client_id}`} className="block">
              <Button fullWidth variant="secondary">
                Abrir ficha
              </Button>
            </Link>
          ) : null}

          {!pending ? (
            <Button fullWidth variant="ghost" onClick={() => router.push("/app/clients/intake")}>
              Voltar à fila
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}
