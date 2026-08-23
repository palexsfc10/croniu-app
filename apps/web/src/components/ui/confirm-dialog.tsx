"use client";

import { Button } from "@/components/ui/button";

type Props = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  confirmVariant?: "primary" | "danger";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancelar",
  confirmVariant = "primary",
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--color-ink)]/45 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-desc"
        className="w-full max-w-sm rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-md"
      >
        <h2 id="confirm-dialog-title" className="text-base font-semibold text-[var(--color-ink)]">
          {title}
        </h2>
        <p id="confirm-dialog-desc" className="mt-2 text-sm leading-relaxed text-[var(--color-ink-muted)]">
          {description}
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <Button
            fullWidth
            variant={confirmVariant}
            disabled={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
          <Button fullWidth variant="secondary" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
