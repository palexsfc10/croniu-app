"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiFetch, type IntakeSubmissionDetail } from "@/lib/api";
import { CONSENT_LABELS_PT, submissionStatusLabel } from "@/lib/intake";
import {
  AnamnesisReader,
  formatAnamnesisAnswer,
} from "@/components/app/anamnesis-reader";
import { BackLink } from "@/components/app/back-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/text-area";
import {
  IconActivity,
  IconAlertCircle,
  IconCalendarDays,
  IconHistory,
  IconPhone,
  IconShieldCheck,
  IconTarget,
} from "@/components/ui/icons";
import { formatSubmittedAt, maskContact } from "@/lib/date-format";

type Sheet = null | "menu" | "approve" | "changes" | "reject";

export default function IntakeSubmissionDetailPage() {
  const params = useParams<{ submissionId: string }>();
  const router = useRouter();
  const [item, setItem] = useState<IntakeSubmissionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [messageToClient, setMessageToClient] = useState("");
  const [internalReason, setInternalReason] = useState("");
  const [approvedJustNow, setApprovedJustNow] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await apiFetch<IntakeSubmissionDetail>(
      `/api/v1/intake-submissions/${params.submissionId}`,
    );
    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      setItem(null);
      return;
    }
    setError(null);
    setItem(result.data ?? null);
  }, [params.submissionId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount/remote hydrate
    void load();
  }, [load]);

  async function postAction(path: string, body: Record<string, unknown>, okMessage: string) {
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
    setSheet(null);
    if (path.endsWith("/approve")) setApprovedJustNow(true);
  }

  const pending = item?.status === "pending_review";
  const snapshot = useMemo(
    () => item?.anamnesis?.questions_snapshot ?? [],
    [item],
  );
  const attentionItems = useMemo(
    () => snapshot.filter((q) => q.attention),
    [snapshot],
  );
  const answersReady = Boolean(item?.anamnesis);
  const canDecide = Boolean(pending && answersReady && !loading && !error);

  const summary = item?.anamnesis?.summary;
  const formName = item?.anamnesis?.form_name || "Cadastro inicial";

  return (
    <div className="space-y-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] animate-fade-up">
      <BackLink href="/app/clients/intake" label="Novos alunos" />
      {error && !item ? (
        <section className="space-y-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <p role="alert" className="text-sm text-[var(--color-ink)]">
            Ainda não foi possível carregar as respostas.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void load()}>Tentar novamente</Button>
            <Button variant="secondary" onClick={() => router.push("/app/clients/intake")}>
              Voltar para a fila
            </Button>
          </div>
        </section>
      ) : null}

      {loading && !item ? (
        <div className="space-y-3" aria-busy="true">
          <div className="h-8 w-48 animate-pulse rounded bg-[var(--color-surface-subtle)]" />
          <div className="h-24 animate-pulse rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)]" />
          <div className="h-40 animate-pulse rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)]" />
        </div>
      ) : null}

      {info ? (
        <p role="status" className="text-sm text-[var(--color-success)]">
          {info}
        </p>
      ) : null}

      {item ? (
        <>
          <header className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">
              {item.full_name}
            </h1>
            <Badge tone={pending ? "warning" : "neutral"}>{submissionStatusLabel(item.status)}</Badge>
            <p className="text-sm text-[var(--color-ink-muted)]">
              {formName}
              {item.submitted_at ? ` · ${formatSubmittedAt(item.submitted_at)}` : ""}
            </p>
            {item.duplicate_alert ? (
              <Badge tone="info">Possível duplicidade</Badge>
            ) : null}
          </header>

          <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-[0_1px_2px_rgba(15,15,20,0.04)]">
            <h2 className="text-sm font-semibold text-[var(--color-ink)]">Resumo do cadastro</h2>
            <ul className="mt-3 space-y-2 text-sm">
              <SummaryRow icon={<IconTarget className="h-[18px] w-[18px]" />} label="Objetivo" value={summary?.primary_goal || item.primary_goal} />
              <SummaryRow icon={<IconHistory className="h-[18px] w-[18px]" />} label="Experiência" value={summary?.experience} />
              <SummaryRow icon={<IconActivity className="h-[18px] w-[18px]" />} label="Modalidade" value={summary?.modalities} />
              <SummaryRow icon={<IconCalendarDays className="h-[18px] w-[18px]" />} label="Disponibilidade" value={summary?.availability} />
              <SummaryRow
                icon={<IconAlertCircle className="h-[18px] w-[18px]" />}
                label="Pontos de atenção"
                value={`${summary?.attention_count ?? attentionItems.length}`}
              />
              <SummaryRow
                icon={<IconPhone className="h-[18px] w-[18px]" />}
                label="Emergência"
                value={item.emergency_contact || "Não informado"}
              />
            </ul>
            <a href="#respostas-completas" className="mt-3 inline-block text-sm font-medium text-[var(--color-link)]">
              Ver respostas completas
            </a>
          </section>

          {attentionItems.length ? (
            <section className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50/70 p-3">
              <div className="flex items-start gap-2">
                <IconAlertCircle className="mt-0.5 h-5 w-5 text-amber-800" />
                <div>
                  <h2 className="text-sm font-semibold text-[var(--color-ink)]">Atenção antes de iniciar</h2>
                  <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                    O aluno informou pontos que precisam ser considerados antes do início das atividades.
                  </p>
                </div>
              </div>
              <ul className="mt-3 space-y-2">
                {attentionItems.map((q) => (
                  <li key={q.id} className="rounded-[var(--radius-sm)] bg-[var(--color-surface)] px-3 py-2 text-sm">
                    <p className="font-medium">{q.label}</p>
                    <p>{formatAnamnesisAnswer(q)}</p>
                    {q.section_title ? (
                      <p className="text-xs text-[var(--color-ink-muted)]">{q.section_title}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <p className="flex items-center gap-2 text-sm text-[var(--color-ink-muted)]">
              <IconShieldCheck className="h-[18px] w-[18px]" />
              Nenhum ponto de atenção identificado no formulário.
            </p>
          )}

          {item.duplicate_alert ? (
            <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <h2 className="text-sm font-semibold">Possível cadastro duplicado</h2>
              <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                Correspondência por contato {maskContact(item.phone_normalized)}.
                {item.archived_match ? " Há um cadastro arquivado com dados semelhantes." : ""}
              </p>
              {item.duplicate_client_id ? (
                <Link href={`/app/clients/${item.duplicate_client_id}`} className="mt-3 inline-block">
                  <Button variant="secondary">Ver cliente existente</Button>
                </Link>
              ) : (
                <p className="mt-2 text-sm">Manter como novo cadastro até conferir a fila.</p>
              )}
            </section>
          ) : null}

          <div id="respostas-completas">
            {answersReady ? (
              <AnamnesisReader compact questions={snapshot} summary={summary} />
            ) : (
              <section className="space-y-3 rounded-[var(--radius-md)] border border-[var(--color-border)] p-4">
                <p role="alert">Ainda não foi possível carregar as respostas.</p>
                <Button onClick={() => void load()}>Tentar novamente</Button>
              </section>
            )}
          </div>

          {item.consents?.length ? (
            <section className="space-y-3">
              <h2 className="text-base font-semibold">Consentimentos</h2>
              <p className="text-sm text-[var(--color-ink-muted)]">
                {item.consents.filter((c) => c.accepted && c.consent_key !== "whatsapp_optional").length} aceitos
                {item.consents.some((c) => c.consent_key === "whatsapp_optional")
                  ? ` · ${item.consents.find((c) => c.consent_key === "whatsapp_optional")?.accepted ? "1 preferência opcional" : "preferência opcional recusada"}`
                  : ""}
              </p>
              <ul className="space-y-2">
                {item.consents.map((c) => (
                  <li
                    key={c.consent_key}
                    className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3"
                  >
                    <p className="text-sm text-[var(--color-ink)]">
                      {CONSENT_LABELS_PT[c.consent_key] ?? "Consentimento"}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-[var(--color-ink-muted)] whitespace-nowrap">
                      {c.accepted ? "Aceito" : "Não aceito"}
                      {c.consent_key === "whatsapp_optional" ? " · Opcional" : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {canDecide ? (
            <section
              id="finalizar-analise"
              className="space-y-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
            >
              <h2 className="text-base font-semibold">Finalizar análise</h2>
              <p className="text-sm text-[var(--color-ink-muted)]">
                Depois de revisar as informações, escolha como deseja continuar.
              </p>
              <Button fullWidth onClick={() => setSheet("approve")}>
                Aprovar cadastro
              </Button>
              <Button fullWidth variant="secondary" onClick={() => setSheet("changes")}>
                Solicitar ajuste
              </Button>
              <Button fullWidth variant="ghost" onClick={() => setSheet("reject")}>
                Recusar cadastro
              </Button>
            </section>
          ) : null}

          {approvedJustNow && item.status === "approved" && item.client_id ? (
            <Link href={`/app/clients/${item.client_id}/accompaniment`}>
              <Button fullWidth>Preparar acompanhamento</Button>
            </Link>
          ) : null}

          {item.client_id && item.status === "approved" && !approvedJustNow ? (
            <Link href={`/app/clients/${item.client_id}`} className="block">
              <Button fullWidth variant="secondary">
                Abrir ficha
              </Button>
            </Link>
          ) : null}
        </>
      ) : null}

      {canDecide ? (
        <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3">
          <p className="text-sm text-[var(--color-ink-muted)]">Revisão concluída?</p>
          <Button
            className="mt-2"
            variant="secondary"
            onClick={() => document.getElementById("finalizar-analise")?.scrollIntoView({ behavior: "smooth" })}
          >
            Decidir
          </Button>
        </div>
      ) : null}

      {sheet ? (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="decision-sheet-title"
        >
          <div className="w-full max-w-md space-y-3 rounded-[var(--radius-lg)] bg-[var(--color-surface)] p-4 shadow-lg">
            {sheet === "approve" ? (
              <>
                <h2 id="decision-sheet-title" className="text-base font-semibold">
                  Aprovar cadastro
                </h2>
                <p className="text-sm text-[var(--color-ink-muted)]">
                  Ao aprovar, o cadastro será transformado em um cliente ativo e você poderá preparar o
                  acompanhamento.
                </p>
                <TextArea
                  label="Mensagem ao aluno (opcional)"
                  value={messageToClient}
                  onChange={(e) => setMessageToClient(e.target.value)}
                  rows={2}
                />
                <Button
                  fullWidth
                  disabled={busy}
                  onClick={() =>
                    void postAction(
                      `/api/v1/intake-submissions/${item!.id}/approve`,
                      { message_to_client: messageToClient.trim() || null },
                      "Cadastro aprovado.",
                    )
                  }
                >
                  Confirmar aprovação
                </Button>
                <Button fullWidth variant="ghost" onClick={() => setSheet(null)}>
                  Cancelar
                </Button>
              </>
            ) : null}
            {sheet === "changes" ? (
              <>
                <h2 id="decision-sheet-title" className="text-base font-semibold">
                  Solicitar ajuste
                </h2>
                <p className="text-sm text-[var(--color-ink-muted)]">
                  Exemplos: completar disponibilidade, detalhar lesão, confirmar contato de emergência.
                </p>
                <TextArea
                  label="Mensagem ao aluno"
                  value={messageToClient}
                  onChange={(e) => setMessageToClient(e.target.value)}
                  rows={3}
                />
                <Button
                  fullWidth
                  disabled={busy || !messageToClient.trim()}
                  onClick={() =>
                    void postAction(
                      `/api/v1/intake-submissions/${item!.id}/request-changes`,
                      { message_to_client: messageToClient.trim() },
                      "Ajustes solicitados ao aluno.",
                    )
                  }
                >
                  Enviar pedido
                </Button>
                <Button fullWidth variant="ghost" onClick={() => setSheet(null)}>
                  Cancelar
                </Button>
              </>
            ) : null}
            {sheet === "reject" ? (
              <>
                <h2 id="decision-sheet-title" className="text-base font-semibold">
                  Recusar cadastro
                </h2>
                <TextArea
                  label="Motivo interno"
                  hint="Não é enviado ao aluno."
                  value={internalReason}
                  onChange={(e) => setInternalReason(e.target.value)}
                  rows={3}
                />
                <TextArea
                  label="Mensagem ao aluno (opcional)"
                  value={messageToClient}
                  onChange={(e) => setMessageToClient(e.target.value)}
                  rows={2}
                />
                <Button
                  fullWidth
                  variant="danger"
                  disabled={busy}
                  onClick={() => {
                    if (!window.confirm("Confirmar recusa deste cadastro?")) return;
                    void postAction(
                      `/api/v1/intake-submissions/${item!.id}/reject`,
                      {
                        rejection_internal_reason: internalReason.trim() || null,
                        message_to_client: messageToClient.trim() || null,
                      },
                      "Cadastro recusado.",
                    );
                  }}
                >
                  Confirmar recusa
                </Button>
                <Button fullWidth variant="ghost" onClick={() => setSheet(null)}>
                  Cancelar
                </Button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SummaryRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value?: string | null;
}) {
  if (!value) return null;
  return (
    <li className="flex items-start gap-2">
      <span className="mt-0.5 text-[var(--color-ink-muted)]" aria-hidden>
        {icon}
      </span>
      <span>
        <span className="block text-xs text-[var(--color-ink-muted)]">{label}</span>
        <span className="text-[var(--color-ink)]">{value}</span>
      </span>
    </li>
  );
}
