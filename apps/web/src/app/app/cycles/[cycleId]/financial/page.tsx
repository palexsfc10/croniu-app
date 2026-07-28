"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  apiFetch,
  formatBRL,
  reaisToCents,
  type Cycle,
  type Receivable,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { BackLink } from "@/components/app/back-link";

type Mode = "discount" | "final";

export default function CycleFinancialEditPage() {
  const params = useParams<{ cycleId: string }>();
  const router = useRouter();
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [receivable, setReceivable] = useState<Receivable | null>(null);
  const [mode, setMode] = useState<Mode>("discount");
  const [discountReais, setDiscountReais] = useState("");
  const [finalReais, setFinalReais] = useState("");
  const [notes, setNotes] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [c, r] = await Promise.all([
        apiFetch<Cycle>(`/api/v1/cycles/${params.cycleId}`),
        apiFetch<Receivable[]>("/api/v1/receivables"),
      ]);
      if (cancelled) return;
      if (c.error) {
        setError(c.error.message);
        return;
      }
      const data = c.data ?? null;
      setCycle(data);
      const linked = (r.data ?? []).find((item) => item.cycle_id === params.cycleId) ?? null;
      setReceivable(linked);
      if (data?.adjustment_cents && data.adjustment_cents < 0) {
        setDiscountReais((Math.abs(data.adjustment_cents) / 100).toFixed(2).replace(".", ","));
        setMode("discount");
      } else if (data?.value_cents != null) {
        setFinalReais((data.value_cents / 100).toFixed(2).replace(".", ","));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.cycleId]);

  const preview = useMemo(() => {
    if (!cycle?.subtotal_cents || cycle.unit_price_cents == null || cycle.lesson_count == null) {
      return null;
    }
    const subtotal = cycle.subtotal_cents;
    if (mode === "discount") {
      const discount = discountReais.trim() ? reaisToCents(discountReais) : 0;
      if (discount == null || discount < 0) return { error: "Desconto inválido." };
      const final = subtotal - discount;
      if (final < 0) return { error: "O valor final não pode ser negativo." };
      return {
        adjustment_cents: -discount,
        final_cents: final,
        label: discount === 0 ? "Sem ajuste" : `Desconto ${formatBRL(discount)}`,
      };
    }
    const final = finalReais.trim() ? reaisToCents(finalReais) : null;
    if (final == null || final < 0) return { error: "Valor final inválido." };
    const adjustment = final - subtotal;
    return {
      adjustment_cents: adjustment,
      final_cents: final,
      label:
        adjustment === 0
          ? "Sem ajuste"
          : adjustment < 0
            ? `Desconto ${formatBRL(-adjustment)}`
            : `Acréscimo ${formatBRL(adjustment)}`,
    };
  }, [cycle, mode, discountReais, finalReais]);

  const paymentLocked = receivable?.status === "received" || receivable?.status === "paid";

  async function save() {
    if (!cycle || !preview || "error" in preview || preview.final_cents == null) return;
    setSaving(true);
    setError(null);
    const body =
      mode === "discount"
        ? {
            adjustment_cents: preview.adjustment_cents,
            notes: notes.trim() || null,
          }
        : {
            final_cents: preview.final_cents,
            notes: notes.trim() || null,
          };
    const result = await apiFetch<Cycle>(`/api/v1/cycles/${cycle.id}/financial`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (result.error) {
      setError(result.error.message);
      setConfirming(false);
      return;
    }
    router.replace(`/app/cycles/${cycle.id}`);
  }

  if (!cycle && !error) {
    return <p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p>;
  }

  return (
    <div className="space-y-4 animate-fade-up">
      <BackLink href={`/app/cycles/${params.cycleId}`} label="Ciclo" />
      <h1 className="h-display text-3xl text-[var(--color-ink)]">Editar valores</h1>

      {cycle ? (
        <section className="space-y-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm">
          <p>
            <span className="text-[var(--color-ink-muted)]">Serviço</span> · {cycle.service_name}
          </p>
          <p>
            <span className="text-[var(--color-ink-muted)]">Aulas</span> · {cycle.lesson_count}
          </p>
          <p>
            <span className="text-[var(--color-ink-muted)]">Valor por aula</span> ·{" "}
            {formatBRL(cycle.unit_price_cents)} (congelado)
          </p>
          <p>
            <span className="text-[var(--color-ink-muted)]">Subtotal</span> ·{" "}
            {formatBRL(cycle.subtotal_cents)}
          </p>
          <p>
            <span className="text-[var(--color-ink-muted)]">Ajuste atual</span> ·{" "}
            {formatBRL(cycle.adjustment_cents ?? 0)}
          </p>
          <p className="font-semibold">Total atual · {formatBRL(cycle.value_cents)}</p>
          <p>
            <span className="text-[var(--color-ink-muted)]">Recebimento</span> ·{" "}
            {receivable
              ? `${formatBRL(receivable.amount_cents)} · ${receivable.status}`
              : "nenhum vinculado"}
          </p>
        </section>
      ) : null}

      <p className="text-sm text-[var(--color-ink-muted)]">
        Esta edição altera somente os valores do ciclo. Sua Agenda permanecerá igual.
      </p>

      {paymentLocked ? (
        <p role="alert" className="rounded-[var(--radius-md)] bg-[var(--color-surface-muted)] px-3 py-3 text-sm">
          Este pagamento já foi confirmado. Para preservar o histórico financeiro, os valores deste
          ciclo não podem ser alterados por esta tela.
        </p>
      ) : null}

      {!paymentLocked && !confirming ? (
        <div className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Como deseja ajustar?</legend>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="radio"
                name="mode"
                checked={mode === "discount"}
                onChange={() => setMode("discount")}
              />
              Informar desconto
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="radio"
                name="mode"
                checked={mode === "final"}
                onChange={() => setMode("final")}
              />
              Informar valor final
            </label>
          </fieldset>

          {mode === "discount" ? (
            <TextField
              label="Desconto (R$)"
              inputMode="decimal"
              value={discountReais}
              onChange={(e) => setDiscountReais(e.target.value)}
            />
          ) : (
            <TextField
              label="Valor final (R$)"
              inputMode="decimal"
              value={finalReais}
              onChange={(e) => setFinalReais(e.target.value)}
            />
          )}

          <TextField
            label="Motivo do ajuste (opcional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          {preview && "error" in preview ? (
            <p role="alert" className="text-sm text-[var(--color-danger)]">
              {preview.error}
            </p>
          ) : preview ? (
            <p className="text-sm">
              Prévia: {preview.label} · total {formatBRL(preview.final_cents)}
            </p>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm text-[var(--color-danger)]">
              {error}
            </p>
          ) : null}

          <Button
            fullWidth
            disabled={!preview || "error" in preview}
            onClick={() => setConfirming(true)}
          >
            Revisar e confirmar
          </Button>
        </div>
      ) : null}

      {!paymentLocked && confirming && preview && !("error" in preview) ? (
        <div className="space-y-4">
          <section className="space-y-2 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 text-sm">
            <p>Valor anterior · {formatBRL(cycle?.value_cents)}</p>
            <p>Novo ajuste · {preview.label}</p>
            <p className="font-semibold">Novo total · {formatBRL(preview.final_cents)}</p>
            <p>
              Recebimento ·{" "}
              {receivable?.status === "pending" || receivable?.status === "expected"
                ? `será atualizado para ${formatBRL(preview.final_cents)}`
                : receivable
                  ? "não será alterado automaticamente"
                  : "nenhum recebimento para atualizar"}
            </p>
          </section>
          <p className="text-sm text-[var(--color-ink-muted)]">
            Esta alteração atualiza os valores do ciclo e, quando permitido, o recebimento pendente.
            As aulas já criadas na Agenda não serão alteradas.
          </p>
          {error ? (
            <p role="alert" className="text-sm text-[var(--color-danger)]">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button variant="secondary" fullWidth onClick={() => setConfirming(false)}>
              Voltar
            </Button>
            <Button fullWidth disabled={saving} onClick={() => void save()}>
              {saving ? "Salvando…" : "Confirmar alteração"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
