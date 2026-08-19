"use client";

import Link from "next/link";
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

  if (loading) return <p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p>;
  if (error) {
    return (
      <p role="alert" className="text-sm text-[var(--color-danger)]">
        {error}
      </p>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-5">
      <Link href="/organizations" className="text-sm font-semibold text-[var(--color-primary)]">
        ← Organizações
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="h-display text-3xl">{data.name}</h1>
        <EnvironmentBadge environment={me?.environment} />
        {data.status === "disabled" ? (
          <span className="rounded-full bg-[var(--color-danger)]/10 px-3 py-1 text-xs font-semibold text-[var(--color-danger)]">
            Desativada
          </span>
        ) : null}
      </div>
      <dl className="grid gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase text-[var(--color-ink-muted)]">Status operacional</dt>
          <dd>{data.operational_status ?? data.status}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-[var(--color-ink-muted)]">Assinatura / trial</dt>
          <dd>{data.subscription_status ?? data.plan_code}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-[var(--color-ink-muted)]">Profissional</dt>
          <dd>{data.owner_name ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-[var(--color-ink-muted)]">E-mail (mascarado)</dt>
          <dd>{data.owner_email_masked ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-[var(--color-ink-muted)]">Cadastro</dt>
          <dd>{new Date(data.created_at).toLocaleString("pt-BR")}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-[var(--color-ink-muted)]">Último acesso</dt>
          <dd>
            {data.last_login_at
              ? new Date(data.last_login_at).toLocaleString("pt-BR")
              : data.last_activity_at
                ? new Date(data.last_activity_at).toLocaleString("pt-BR")
                : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-[var(--color-ink-muted)]">Clientes / Ciclos / Agenda</dt>
          <dd>
            {data.clients_count} / {data.cycles_count} / {data.appointments_count ?? 0}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-[var(--color-ink-muted)]">Profissão</dt>
          <dd>{data.profession_label ?? "Não preenchida"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-[var(--color-ink-muted)]">Especialidade</dt>
          <dd>{data.profession_specialty ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-[var(--color-ink-muted)]">Onboarding profissional</dt>
          <dd>{data.profession_onboarding_done ? "Concluído" : "Pendente"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-[var(--color-ink-muted)]">Formulário recomendado</dt>
          <dd>{data.recommended_form_kind ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-[var(--color-ink-muted)]">Planos / publicados / ocorrências atrasadas</dt>
          <dd>
            {data.plans_count ?? 0} / {data.published_plans_count ?? 0} / {data.overdue_occurrences_count ?? 0}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-[var(--color-ink-muted)]">Uso do Assistente</dt>
          <dd>{data.assistant_threads_count ?? 0} conversa(s)</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-[var(--color-ink-muted)]">Fim do período de teste</dt>
          <dd>{formatLocal(data.trial_ends_at_local ?? data.trial_ends_at, data.timezone)}</dd>
        </div>
      </dl>

      <TrialExtensionSection data={data} onUpdated={load} />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Timeline administrativa</h2>
        {!timeline || timeline.events.length === 0 ? (
          <p className="rounded border border-dashed border-[var(--color-border)] p-3 text-sm text-[var(--color-ink-muted)]">
            Sem eventos persistidos além do cadastro (ou dados ainda não existentes).
          </p>
        ) : (
          <ol className="space-y-2 border-l border-[var(--color-border)] pl-4">
            {timeline.events.map((ev) => (
              <li key={`${ev.kind}-${ev.occurred_at}`} className="relative">
                <span className="absolute -left-[1.15rem] top-1.5 h-2 w-2 rounded-full bg-[var(--color-primary)]" />
                <p className="text-sm font-semibold">{ev.label}</p>
                <p className="text-xs text-[var(--color-ink-muted)]">
                  {new Date(ev.occurred_at).toLocaleString("pt-BR")} · {ev.kind}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>

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

  async function submit() {
    if (!validDays || reason.trim().length < 3) {
      setFormError("Informe uma quantidade de dias válida (1 a 90) e um motivo com pelo menos 3 caracteres.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    const res = await apiFetch<TrialExtendOut>(`/api/v1/platform/organizations/${data.id}/trial/extend`, {
      method: "POST",
      body: JSON.stringify({ additional_days: validDays, reason: reason.trim() }),
    });
    setSubmitting(false);
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
    <section className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div>
        <h2 className="text-lg font-semibold">Gestão do trial</h2>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Estende o período de teste sem gerar cobrança nem checkout. Disponível apenas enquanto a
          assinatura está em teste ou expirada sem conversão.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TRIAL_QUICK_OPTIONS.map((days) => (
          <Button
            key={days}
            type="button"
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

      {validDays && previewEnd ? (
        <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] p-3 text-sm">
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

      {formError ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {formError}
        </p>
      ) : null}
      {result ? (
        <p className="text-sm text-[var(--color-success,theme(colors.green.600))]">
          Teste estendido com sucesso — novo término:{" "}
          {formatLocal(result.new_trial_ends_at_local, data.timezone)}.
        </p>
      ) : null}

      <Button type="button" disabled={submitting || !validDays} onClick={() => void submit()}>
        {submitting ? "Estendendo…" : "Estender teste"}
      </Button>
    </section>
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
    <section className="space-y-4 rounded-[var(--radius-lg)] border border-[var(--color-danger)]/40 bg-[var(--color-surface)] p-4">
      <div>
        <h2 className="text-lg font-semibold text-[var(--color-danger)]">Área de perigo</h2>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Ações abaixo afetam o acesso da organização. Nenhuma delas altera cobrança externa
          silenciosamente.
        </p>
      </div>
      {data.status === "disabled" ? (
        <ReactivateBlock data={data} onUpdated={onUpdated} />
      ) : (
        <DeactivateBlock data={data} onUpdated={onUpdated} />
      )}
      <hr className="border-[var(--color-border)]" />
      <PermanentDeleteBlock data={data} onUpdated={onUpdated} />
    </section>
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
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function submit() {
    if (reason.trim().length < 3) {
      setFormError("Informe um motivo com pelo menos 3 caracteres.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    const res = await apiFetch<OrganizationDetail>(`/api/v1/platform/organizations/${data.id}/deactivate`, {
      method: "POST",
      body: JSON.stringify({ confirmation_text: confirmationText, reason: reason.trim() }),
    });
    setSubmitting(false);
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
      <h3 className="font-semibold">Desativar conta</h3>
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
        disabled={submitting || confirmationText.trim().length === 0}
        onClick={() => void submit()}
      >
        {submitting ? "Desativando…" : "Desativar conta"}
      </Button>
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
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function submit() {
    if (reason.trim().length < 3) {
      setFormError("Informe um motivo com pelo menos 3 caracteres.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    const res = await apiFetch<OrganizationDetail>(`/api/v1/platform/organizations/${data.id}/reactivate`, {
      method: "POST",
      body: JSON.stringify({ reason: reason.trim() }),
    });
    setSubmitting(false);
    if (res.error) {
      setFormError(res.error.message);
      return;
    }
    setReason("");
    await onUpdated();
  }

  return (
    <div className="space-y-3">
      <h3 className="font-semibold">Reativar conta</h3>
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
      <Button type="button" disabled={submitting} onClick={() => void submit()}>
        {submitting ? "Reativando…" : "Reativar conta"}
      </Button>
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
    if (!understood || reason.trim().length < 3) {
      setFormError("Confirme que entende a irreversibilidade e informe um motivo.");
      return;
    }
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
        <h3 className="font-semibold">Excluir permanentemente</h3>
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
      <h3 className="font-semibold">Excluir permanentemente</h3>
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
              disabled={submitting || !understood || confirmationText.trim().length === 0}
              onClick={() => void submit()}
              className="!bg-[var(--color-danger)] hover:!bg-[var(--color-danger)]"
            >
              {submitting ? "Excluindo…" : "Excluir permanentemente"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
