"use client";

import { useEffect, type ReactNode } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  children: ReactNode;
  className?: string;
};

/** Shared action-sheet shell: a fixed, full-viewport backdrop with the
 * sheet centered on wider screens and anchored to the bottom on mobile —
 * the same proven layout already used by ConfirmDialog and the
 * accompaniment/routines sheets. Closes on Escape or on a click outside
 * the sheet itself, so popovers anchored to a trigger button (which can
 * render clipped or overlapping content depending on scroll position and
 * viewport size) get the same reliable, centered placement as every
 * other dialog in the app. */
export function ActionSheet({ open, onClose, labelledBy, children, className }: Props) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-[var(--color-ink)]/45 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={
          className ??
          "w-full max-w-sm rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-md)]"
        }
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
