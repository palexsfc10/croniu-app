"use client";

import { useState } from "react";
import { ActionSheet } from "@/components/ui/action-sheet";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { TextArea } from "@/components/ui/text-area";
import { BlockError } from "@/components/ui/block-error";
import { apiFetch, type RenewalCaseView } from "@/lib/api";
import { RESOLUTION_REASON_OPTIONS } from "@/lib/renewal-status";

/** Shared everywhere a renewal case can be worked from — Central de
 * Renovações, Central de Ciclos, Cliente 360°. Both sheets only ever call
 * the two real resolution endpoints; neither ever touches the cycle
 * itself. */

export function AwaitingClientSheet({
  open,
  onClose,
  cycleId,
  clientName,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  cycleId: string;
  clientName: string | null;
  onDone: (view: RenewalCaseView) => void;
}) {
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!date) {
      setError("Informe a próxima data de contato.");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await apiFetch<RenewalCaseView>(
      `/api/v1/renewal-cases/${cycleId}/awaiting-client`,
      { method: "POST", body: JSON.stringify({ next_contact_date: date }) },
    );
    setSaving(false);
    if (result.error || !result.data) {
      setError(result.error?.message ?? "Não foi possível salvar.");
      return;
    }
    setDate("");
    onDone(result.data);
    onClose();
  }

  return (
    <ActionSheet open={open} onClose={onClose} labelledBy="awaiting-client-title">
      <h2 id="awaiting-client-title" className="text-base font-semibold text-[var(--color-ink)]">
        Aguardando cliente{clientName ? ` · ${clientName}` : ""}
      </h2>
      <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
        Registre quando você vai retomar o contato — para o caso não ficar esquecido.
      </p>
      <div className="mt-3">
        <TextField
          label="Próximo contato"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </div>
      {error ? (
        <div className="mt-2">
          <BlockError message={error} />
        </div>
      ) : null}
      <Button fullWidth className="mt-3" disabled={saving} onClick={() => void save()}>
        {saving ? "Salvando…" : "Marcar aguardando cliente"}
      </Button>
    </ActionSheet>
  );
}

export function EndWithoutRenewalSheet({
  open,
  onClose,
  cycleId,
  clientName,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  cycleId: string;
  clientName: string | null;
  onDone: (view: RenewalCaseView) => void;
}) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!reason) {
      setError("Selecione um motivo.");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await apiFetch<RenewalCaseView>(
      `/api/v1/renewal-cases/${cycleId}/end-without-renewal`,
      {
        method: "POST",
        body: JSON.stringify({
          resolution_reason: reason,
          resolution_note: note.trim() || null,
        }),
      },
    );
    setSaving(false);
    if (result.error || !result.data) {
      setError(result.error?.message ?? "Não foi possível salvar.");
      return;
    }
    setReason("");
    setNote("");
    onDone(result.data);
    onClose();
  }

  return (
    <ActionSheet open={open} onClose={onClose} labelledBy="end-without-renewal-title">
      <h2
        id="end-without-renewal-title"
        className="text-base font-semibold text-[var(--color-ink)]"
      >
        Encerrar sem renovar{clientName ? ` · ${clientName}` : ""}
      </h2>
      <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
        Fecha o processo de renovação. Nenhum ciclo é alterado.
      </p>
      <div className="mt-3 space-y-3">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-[var(--color-ink)]">Motivo</span>
          <select
            className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          >
            <option value="">Selecione</option>
            {RESOLUTION_REASON_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <TextArea
          label="Observação (opcional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
        />
      </div>
      {error ? (
        <div className="mt-2">
          <BlockError message={error} />
        </div>
      ) : null}
      <Button fullWidth className="mt-3" disabled={saving} onClick={() => void save()}>
        {saving ? "Salvando…" : "Encerrar sem renovar"}
      </Button>
    </ActionSheet>
  );
}
