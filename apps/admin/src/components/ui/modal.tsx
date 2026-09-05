"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  titleId,
  descriptionId,
  onClose,
  children,
  placement = "center",
}: {
  open: boolean;
  titleId: string;
  descriptionId?: string;
  onClose: () => void;
  children: ReactNode;
  placement?: "center" | "drawer";
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  useLayoutEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = dialog?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    (focusable?.[0] ?? dialog)?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (items.length === 0) { event.preventDefault(); dialog.focus(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className={placement === "drawer" ? "fixed inset-0 z-50 flex bg-[var(--color-ink)]/45" : "fixed inset-0 z-50 flex items-end justify-center bg-[var(--color-ink)]/45 p-4 sm:items-center"}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className={placement === "drawer" ? "flex h-dvh w-80 max-w-[90vw] flex-col bg-[var(--color-surface)] shadow-xl" : "fade-up max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-md"}
      >
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancelar",
  confirmVariant = "primary",
  busy = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  confirmVariant?: "primary" | "danger";
  busy?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  return (
    <Modal open={open} titleId="confirm-dialog-title" descriptionId={description ? "confirm-dialog-desc" : undefined} onClose={() => { if (!busy) onCancel(); }}>
      <h2 id="confirm-dialog-title" className="text-base font-semibold text-[var(--color-ink)]">
        {title}
      </h2>
      {description ? (
        <p id="confirm-dialog-desc" className="mt-2 text-sm leading-relaxed text-[var(--color-ink-muted)]">
          {description}
        </p>
      ) : null}
      {children ? <div className="mt-3">{children}</div> : null}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row-reverse">
        <Button
          fullWidth
          variant={confirmVariant}
          disabled={busy || confirmDisabled}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
        <Button fullWidth variant="secondary" disabled={busy} onClick={onCancel}>
          {cancelLabel}
        </Button>
      </div>
    </Modal>
  );
}
