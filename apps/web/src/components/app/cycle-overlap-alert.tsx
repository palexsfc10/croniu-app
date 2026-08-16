"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export function isDuplicateCycleCode(code: string | undefined) {
  return code === "DUPLICATE_CYCLE";
}

export function isOverlappingCycleCode(code: string | undefined) {
  return code === "OVERLAPPING_CYCLE";
}

type Props = {
  code: "DUPLICATE_CYCLE" | "OVERLAPPING_CYCLE";
  message: string;
  existingCycleId?: string | null;
  clientId?: string;
  onAdjustPeriod: () => void;
  onCancel: () => void;
};

export function CycleOverlapAlert({
  code,
  message,
  existingCycleId,
  clientId,
  onAdjustPeriod,
  onCancel,
}: Props) {
  const cycleHref = existingCycleId ? `/app/cycles/${existingCycleId}` : "/app/cycles";
  const backHref = clientId ? `/app/clients/${clientId}` : "/app/cycles";

  return (
    <div
      role="alert"
      className="space-y-2 rounded-[var(--radius-md)] border border-[var(--color-danger)]/25 bg-[var(--color-danger-subtle)] px-3 py-3"
    >
      <p className="text-sm font-semibold text-[var(--color-danger)]">
        {code === "DUPLICATE_CYCLE" ? "Ciclo duplicado" : "Período sobreposto"}
      </p>
      <p className="text-sm text-[var(--color-ink)]">{message}</p>
      <div className="flex flex-wrap gap-2 pt-1">
        <Link
          href={cycleHref}
          className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 text-sm font-semibold text-white"
        >
          Ver ciclo existente
        </Link>
        {code === "DUPLICATE_CYCLE" ? (
          <Link
            href={backHref}
            className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 text-sm font-semibold"
          >
            Voltar para a ficha
          </Link>
        ) : (
          <>
            <Button type="button" variant="secondary" onClick={onAdjustPeriod}>
              Ajustar período
            </Button>
            <Button type="button" variant="secondary" onClick={onCancel}>
              Cancelar
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
