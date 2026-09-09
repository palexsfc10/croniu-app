"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  children: ReactNode;
  className?: string;
  /** Sticky action row rendered below the scrollable body, pinned to the
   * bottom of the sheet itself (not the window) — use it for a sheet's
   * primary actions when the body above can grow (e.g. an async state
   * change reveals more content), so those actions can never end up
   * pushed past the visible viewport or clipped by the mobile bottom
   * nav. Omit it for short, static content (the default layout). */
  footer?: ReactNode;
};

/** Shared action-sheet shell: a fixed, full-viewport backdrop with the
 * sheet centered on wider screens and anchored to the bottom on mobile —
 * the same proven layout already used by ConfirmDialog and the
 * accompaniment/routines sheets.
 *
 * Rendered through a portal into `document.body` (not inline where the
 * component is used): a sheet triggered from deep inside a page still
 * needs to sit visually above the mobile bottom nav, and relying on
 * z-index alone across several nested, non-trivial ancestors (cards with
 * their own stacking contexts, the bottom nav's own `backdrop-filter`
 * layer) is exactly the kind of thing that only breaks on some engines —
 * reproduced on a real device even though the desktop z-index math looked
 * fine. A portal sidesteps all of that: it becomes a literal top-level
 * sibling of the whole app shell, so its `position: fixed` box is always
 * relative to the true viewport and its explicit z-index is compared
 * against the shell's own top-level layers, not whatever stacking context
 * its trigger button happened to be nested in. */
export function ActionSheet({ open, onClose, labelledBy, children, className, footer }: Props) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // A sheet is modal — the page behind must not scroll while it's open
  // (otherwise a two-finger/edge swipe on mobile scrolls the page under
  // what looks like a fixed overlay).
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // Move focus into the sheet on open (so Escape/Tab work immediately
  // instead of still targeting whatever was focused underneath), restore
  // it to the trigger button on close.
  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => {
      restoreFocusRef.current?.focus?.();
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-[var(--color-ink)]/45 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={
          className ??
          "flex max-h-[calc(100dvh-2rem-env(safe-area-inset-bottom))] w-full max-w-sm flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-md outline-none"
        }
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        {footer ? (
          <div className="shrink-0 border-t border-[var(--color-border)] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
