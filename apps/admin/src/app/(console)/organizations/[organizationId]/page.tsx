"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  apiFetch,
  type OrganizationDeletionPreview,
  type OrganizationDetail,
  type OrganizationPermanentDeleteResult,
  type TrialExtendOut,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { EnvironmentBadge } from "@/components/environment-identity";
import { useAdminAuth } from "@/components/auth/admin-auth-provider";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { ConfirmDialog } from "@/components/ui/modal";
import { CopyableId } from "@/components/ui/copyable-id";
import { Skeleton } from "@/components/ui/skeleton";
import { statusTone } from "@/lib/status-tone";
import { IconShieldAlert } from "@/components/ui/icons";

type TimelineEvent = {
  kind: string;
  label: string;
  occurred_at: string;
  metadata_safe?: Record<string, unknown>;
};

type Timeline = {
  organization_id: string;
  organization_name: string;
  events: TimelineEvent[];
};

const TRIAL_QUICK_OPTIONS = [3, 7, 15, 30];
const TRIAL_MAX_DAYS = 90;

const DATA_LABELS: Record<string, string> = {
  clients: "Clientes",
  cycles: "Ciclos",
  appointments: "Agendamentos",
  receivables: "Recebíveis",
  memberships: "Vínculos de equipe",
  feedbacks: "Feedbacks enviados",
  active_sessions: "Sessões ativas",
};

function formatLocal(iso: string | null | undefined, timezone: string | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      timeZone: timezone || "America/Sao_Paulo",
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return new Date(iso).toLocaleString("pt-BR");
  }
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">{label}</dt>
      <dd className="mt-0.5 text-sm text-[var(--color-ink)]">{value}</dd>
    </div>
  );
}

export default function OrganizationDetailPage() {
  const params = useParams<{ organizationId: string }>();
  const { me } = useAdminAuth();
  const [data, setData] = useState<OrganizationDetail | null>(null);
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const orgId = params.organizationId;

  const load = useCallback(async () => {
    const [detail, tl] = await Promise.all([
      apiFetch<OrganizationDetail>(`/api/v1/platform/organizations/${orgId}`),
      apiFetch<Timeline>(`/api/v1/platform/organizations/${orgId}/timeline`),
    ]);
    if (detail.error) setError(detail.error.message);
    else {
      setError(null);
      setData(detail.data ?? null);
    }
    if (!tl.error) setTimeline(tl.data ?? null);
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount/param reload
    setLoading(true);
    void load();
  }, [load]);

  if (error) {
    return (
      <Card rail="danger">
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      </Card>
    );
  }

  if (loading || !data) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-9 w-72" />
        <Card>
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-4 w-32" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Organizações", href: "/organizations" }, { label: data.name }]} />

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="h-display text-3xl">{data.name}</h1>
        <EnvironmentBadge environment={me?.environment} />
        <Badge tone={statusTone(data.operational_status ?? data.status)}>
          {data.operational_status ?? data.status}
        </Badge>
      </div>

      <Card>
        <CardHeader title="Resumo" />
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Profissional" value={data.owner_name ?? "—"} />
          <Field label="E-mail (mascarado)" value={data.owner_email_masked ?? "—"} />
          <Field label="Cadastro" value={new Date(data.created_at).toLocaleString("pt-BR")} />
          <Field
            label="Último acesso"
            value={
              data.last_login_at
                ? `Login: ${new Date(data.last_login_at).toLocaleString("pt-BR")}`
                : data.last_activity_at
                  ? `Atividade: ${new Date(data.last_activity_at).toLocaleString("pt-BR")}`
                  : "—"
            }
          />
          <Field label="Profissão" value={data.profession_label ?? "Não preenchida"} />
          <Field label="Especialidade" value={data.profession_specialty ?? "—"} />
          <Field
            label="Onboarding profissional"
            value={
              <Badge tone={data.profession_onboarding_done ? "success" : "warning"}>
                {data.profession_onboarding_done ? "Concluído" : "Pendente"}
              </Badge>
            }
          />
          <Field label="Formulário recomendado" value={data.recommended_form_kind ?? "—"} />
        </dl>
      </Card>

      <Card>
        <CardHeader title="Uso do produto" />
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field
            label="Clientes / Ciclos / Agenda"
            value={`${data.clients_count} / ${data.cycles_count} / ${data.appointments_count ?? 0}`}
          />
          <Field
            label="Planos / publicados / ocorrências atrasadas"
            value={`${data.plans_count ?? 0} / ${data.published_plans_count ?? 0} / ${data.overdue_occurrences_count ?? 0}`}
          />
          <Field label="Uso do Assistente" value={`${data.assistant_threads_count ?? 0} conversa(s)`} />
        </dl>
      </Card>

      <TrialExtensionSection data={data} onUpdated={load} />

      <Card>
        <CardHeader title="Timeline administrativa" />
        {!timeline || timeline.events.length === 0 ? (
          <p className="rounded border border-dashed border-[var(--color-border)] p-3 text-sm text-[var(--color-ink-muted)]">
            Sem eventos persistidos além do cadastro (ou dados ainda não existentes).
          </p>
        ) : (
          <ol className="space-y-3 border-l border-[var(--color-border)] pl-4">
            {timeline.events.map((ev) => {
              const metaEntries = Object.entries(ev.metadata_safe ?? {});
              return (
                <li key={`${ev.kind}-${ev.occurred_at}`} className="relative">
                  <span className="absolute -left-[1.15rem] top-1.5 h-2 w-2 rounded-full bg-[var(--color-primary)]" />
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-[var(--color-ink)]">{ev.label}</p>
                    <CopyableId value={ev.kind} label="tipo de evento" />
                  </div>
                  <p className="text-xs text-[var(--color-ink-muted)]">
                    {new Date(ev.occurred_at).toLocaleString("pt-BR")}
                  </p>
                  {metaEntries.length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {metaEntries.map(([key, value]) => (
                        <span
                          key={key}
                          className="rounded-[var(--radius-sm)] bg-[var(--color-surface-subtle)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--color-ink-muted)]"
                        >
                          {key}: {String(value)}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      <DangerZoneSection data={data} onUpdated={load} />
    </div>
  );
}

function TrialExtensionSection({
  data,
  onUpdated,
}: {
  data: OrganizationDetail;
  onUpdated: () => Promise<void>;
}) {
  const [selectedDays, setSelectedDays] = useState<number | null>(7);
  const [customDays, setCustomDays] = useState("");
  const [reason, setReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<TrialExtendOut | null>(null);

  const effectiveDays = customDays.trim() ? Number(customDays) : selectedDays;
  const validDays =
    effectiveDays != null && Number.isInteger(effectiveDays) && effectiveDays >= 1 && effectiveDays <= TRIAL_MAX_DAYS
      ? effectiveDays
      : null;

  const currentEnd = data.trial_ends_at ? new Date(data.trial_ends_at) : null;
  // eslint-disable-next-line react-hooks/purity -- live preview of "now + N days", not stored state
  const now = Date.now();
  const previewEnd =
    validDays != null && currentEnd
      ? new Date(Math.max(currentEnd.getTime(), now) + validDays * 24 * 60 * 60 * 1000)
      : null;

  function requestConfirm() {
    if (!validDays || reason.trim().length < 3) {
      setFormError("Informe uma quantidade de dias válida (1 a 90) e um motivo com pelo menos 3 caracteres.");
      return;
    }
    setFormError(null);
    setConfirmOpen(true);
  }

  async function submit() {
    if (!validDays) return;
    setSubmitting(true);
    setFormError(null);
    const res = await apiFetch<TrialExtendOut>(`/api/v1/platform/organizations/${data.id}/trial/extend`, {
      method: "POST",
      body: JSON.stringify({ additional_days: validDays, reason: reason.trim() }),
    });
    setSubmitting(false);
    setConfirmOpen(false);
    if (res.error) {
      setFormError(res.error.message);
      return;
    }
    setReason("");
    setCustomDays("");
    await onUpdated();
    setResult(res.data ?? null);
  }

  return (
    <Card>
      <CardHeader
        title="Gestão do trial"
        description="Estende o período de teste sem gerar cobrança nem checkout. Disponível apenas enquanto a assinatura está em teste ou expirada sem conversão."
      />

      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {TRIAL_QUICK_OPTIONS.map((days) => (
            <Button
              key={days}
              type="button"
              size="sm"
              variant={selectedDays === days && !customDays.trim() ? "primary" : "secondary"}
              onClick={() => {
                setSelectedDays(days);
                setCustomDays("");
              }}
            >
              +{days} dias
            </Button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Quantidade personalizada (1 a 90 dias)"
            type="number"
            min={1}
            max={TRIAL_MAX_DAYS}
            value={customDays}
            onChange={(e) => setCustomDays(e.target.value)}
            placeholder="Ex.: 45"
          />
          <TextField
            label="Motivo administrativo"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex.: cliente solicitou mais tempo para avaliar."
          />
        </div>

        {formError ? (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {formError}
          </p>
        ) : null}
        {result ? (
          <p className="text-sm font-medium text-[var(--color-success)]">
            Teste estendido com sucesso — novo término:{" "}
            {formatLocal(result.new_trial_ends_at_local, data.timezone)}.
          </p>
        ) : null}

        <Button type="button" disabled={!validDays} onClick={requestConfirm}>
          Estender teste
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Confirmar extensão de teste"
        confirmLabel={submitting ? "Estendendo…" : "Confirmar extensão"}
        busy={submitting}
        confirmVariant="primary"
        onConfirm={() => void submit()}
        onCancel={() => setConfirmOpen(false)}
      >
        {validDays && previewEnd ? (
          <div className="space-y-1 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] p-3 text-sm">
            <p>
              Término atual:{" "}
              <strong>{formatLocal(data.trial_ends_at_local ?? data.trial_ends_at, data.timezone)}</strong>
            </p>
            <p>
              Dias adicionados: <strong>{validDays}</strong>
            </p>
            <p>
              Nova data de término:{" "}
              <strong>
                {previewEnd.toLocaleString("pt-BR", { timeZone: data.timezone || "America/Sao_Paulo" })}
              </strong>
            </p>
          </div>
        ) : null}
      </ConfirmDialog>
    </Card>
  );
}

function DangerZoneSection({
  data,
  onUpdated,
}: {
  data: OrganizationDetail;
  onUpdated: () => Promise<void>;
}) {
  return (
    <Card rail="danger" className="space-y-4">
      <div className="flex items-center gap-2">
        <IconShieldAlert className="h-5 w-5 text-[var(--color-danger)]" />
        <h2 className="text-lg font-semibold text-[var(--color-danger)]">Área de perigo</h2>
      </div>
      <p className="-mt-2 text-sm text-[var(--color-ink-muted)]">
        Ações abaixo afetam o acesso da organização. Nenhuma delas altera cobrança externa
        silenciosamente.
      </p>
      {data.status === "disabled" ? (
        <ReactivateBlock data={data} onUpdated={onUpdated} />
      ) : (
        <DeactivateBlock data={data} onUpdated={onUpdated} />
      )}
      <hr className="border-[var(--color-border)]" />
      <PermanentDeleteBlock data={data} onUpdated={onUpdated} />
    </Card>
  );
}

function DeactivateBlock({
  data,
  onUpdated,
}: {
  data: OrganizationDetail;
  onUpdated: () => Promise<void>;
}) {
  const [confirmationText, setConfirmationText] = useState("");
  const [reason, setReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setFormError(null);
    const res = await apiFetch<OrganizationDetail>(`/api/v1/platform/organizations/${data.id}/deactivate`, {
      method: "POST",
      body: JSON.stringify({ confirmation_text: confirmationText, reason: reason.trim() }),
    });
    setSubmitting(false);
    setConfirmOpen(false);
    if (res.error) {
      setFormError(res.error.message);
      return;
    }
    setConfirmationText("");
    setReason("");
    await onUpdated();
  }

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-[var(--color-ink)]">Desativar conta</h3>
      <p className="text-sm text-[var(--color-ink-muted)]">
        Encerra as sessões ativas e bloqueia novos logins. Dados, auditoria, cobrança e cupom de
        indicação são preservados. Pode ser revertido a qualquer momento.
      </p>
      <TextField
        label={`Digite o nome da organização ("${data.name}") ou o e-mail do titular para confirmar`}
        value={confirmationText}
        onChange={(e) => setConfirmationText(e.target.value)}
      />
      <TextField
        label="Motivo administrativo"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      {formError ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {formError}
        </p>
      ) : null}
      <Button
        type="button"
        variant="secondary"
        disabled={confirmationText.trim().length === 0 || reason.trim().length < 3}
        onClick={() => setConfirmOpen(true)}
      >
        Desativar conta
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        title="Confirmar desativação"
        description={`A organização "${data.name}" perderá acesso imediatamente. Sessões ativas serão encerradas e novos logins bloqueados. Nenhum dado será apagado e a ação pode ser revertida a qualquer momento.`}
        confirmLabel={submitting ? "Desativando…" : "Confirmar desativação"}
        confirmVariant="danger"
        busy={submitting}
        onConfirm={() => void submit()}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

function ReactivateBlock({
  data,
  onUpdated,
}: {
  data: OrganizationDetail;
  onUpdated: () => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setFormError(null);
    const res = await apiFetch<OrganizationDetail>(`/api/v1/platform/organizations/${data.id}/reactivate`, {
      method: "POST",
      body: JSON.stringify({ reason: reason.trim() }),
    });
    setSubmitting(false);
    setConfirmOpen(false);
    if (res.error) {
      setFormError(res.error.message);
      return;
    }
    setReason("");
    await onUpdated();
  }

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-[var(--color-ink)]">Reativar conta</h3>
      <p className="text-sm text-[var(--color-ink-muted)]">
        {data.disabled_reason ? (
          <>
            Desativada em {formatLocal(data.disabled_at_local ?? data.disabled_at, data.timezone)} —
            motivo registrado: “{data.disabled_reason}”.
          </>
        ) : (
          "Esta organização está desativada."
        )}
      </p>
      <TextField
        label="Motivo administrativo da reativação"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      {formError ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {formError}
        </p>
      ) : null}
      <Button type="button" disabled={reason.trim().length < 3} onClick={() => setConfirmOpen(true)}>
        Reativar conta
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        title="Confirmar reativação"
        description={`A organização "${data.name}" recuperará acesso imediatamente e o profissional poderá fazer login novamente.`}
        confirmLabel={submitting ? "Reativando…" : "Confirmar reativação"}
        busy={submitting}
        onConfirm={() => void submit()}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

function PermanentDeleteBlock({
  data,
  onUpdated,
}: {
  data: OrganizationDetail;
  onUpdated: () => Promise<void>;
}) {
  const [preview, setPreview] = useState<OrganizationDeletionPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<OrganizationPermanentDeleteResult | null>(null);

  async function loadPreview() {
    setLoadingPreview(true);
    setPreviewError(null);
    const res = await apiFetch<OrganizationDeletionPreview>(
      `/api/v1/platform/organizations/${data.id}/deletion-preview`,
    );
    setLoadingPreview(false);
    if (res.error) {
      setPreviewError(res.error.message);
      return;
    }
    setPreview(res.data ?? null);
  }

  async function submit() {
    setSubmitting(true);
    setFormError(null);
    const res = await apiFetch<OrganizationPermanentDeleteResult>(
      `/api/v1/platform/organizations/${data.id}/permanent-delete`,
      {
        method: "POST",
        body: JSON.stringify({
          confirmation_text: confirmationText,
          confirmation_understood: understood,
          reason: reason.trim(),
        }),
      },
    );
    setSubmitting(false);
    setConfirmOpen(false);
    if (res.error) {
      setFormError(res.error.message);
      return;
    }
    await onUpdated();
    setResult(res.data ?? null);
  }

  if (result) {
    return (
      <div className="space-y-2">
        <h3 className="font-semibold text-[var(--color-ink)]">Excluir permanentemente</h3>
        <p className="text-sm">
          {result.mode === "hard_delete"
            ? "Organização excluída permanentemente."
            : "Organização não podia ser excluída fisicamente (há histórico financeiro ou de indicação) — os dados pessoais foram anonimizados e o registro financeiro foi preservado."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-[var(--color-ink)]">Excluir permanentemente</h3>
      <p className="text-sm text-[var(--color-ink-muted)]">
        Ação irreversível. Quando há cobrança, assinatura ou indicação vinculada, os dados pessoais
        são anonimizados em vez de removidos, preservando o histórico financeiro.
      </p>

      {!preview ? (
        <Button type="button" variant="secondary" disabled={loadingPreview} onClick={() => void loadPreview()}>
          {loadingPreview ? "Carregando…" : "Ver o que será removido"}
        </Button>
      ) : (
        <div className="space-y-3 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] p-3 text-sm">
          <p>
            {preview.eligible_for_hard_delete
              ? "Esta organização não possui histórico financeiro ou de indicação — a exclusão será física e definitiva."
              : "Esta organização possui histórico financeiro ou de indicação — os dados pessoais serão anonimizados, e os registros financeiros/de auditoria serão preservados."}
          </p>
          {preview.blocking_reasons.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5">
              {preview.blocking_reasons.map((reasonText) => (
                <li key={reasonText}>{reasonText}</li>
              ))}
            </ul>
          ) : null}
          <div>
            <p className="font-medium">Dados que serão removidos ou desvinculados:</p>
            <ul className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1">
              {Object.entries(preview.data_to_remove).map(([key, count]) => (
                <li key={key}>
                  {DATA_LABELS[key] ?? key}: <strong>{count}</strong>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-3 border-t border-[var(--color-border)] pt-3">
            <TextField
              label={`Digite o nome da organização ("${data.name}") ou o e-mail do titular para confirmar`}
              value={confirmationText}
              onChange={(e) => setConfirmationText(e.target.value)}
            />
            <TextField
              label="Motivo administrativo da exclusão"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={understood}
                onChange={(e) => setUnderstood(e.target.checked)}
              />
              <span>Entendo que esta ação é irreversível e não pode ser desfeita pelo Admin.</span>
            </label>
            {formError || previewError ? (
              <p role="alert" className="text-sm text-[var(--color-danger)]">
                {formError ?? previewError}
              </p>
            ) : null}
            <Button
              type="button"
              variant="danger"
              disabled={!understood || confirmationText.trim().length === 0 || reason.trim().length < 3}
              onClick={() => setConfirmOpen(true)}
            >
              Excluir permanentemente
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Confirmar exclusão permanente"
        description={`Esta é a última confirmação. "${data.name}" será ${preview?.eligible_for_hard_delete ? "excluída permanentemente" : "anonimizada, preservando registros financeiros"}. Esta ação não pode ser desfeita pelo Admin.`}
        confirmLabel={submitting ? "Excluindo…" : "Excluir definitivamente"}
        confirmVariant="danger"
        busy={submitting}
        onConfirm={() => void submit()}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
