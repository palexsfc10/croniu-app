"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Shared open/close-on-outside-click/Escape shell for small anchored
 * dropdowns and popovers (topbar's Criar/Ajuda, Cliente 360°'s "Mais
 * ações", any "Outras opções" menu) — one place instead of re-implementing
 * the same outside-click + Escape + focus-return wiring per trigger.
 */
export function useDropdown() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return { open, setOpen, rootRef, triggerRef, close: () => setOpen(false) };
}

/** Visual shell for the popover panel itself — anchored to the right edge
 * of its `relative` root (the topbar's dropdowns open leftward from a
 * right-aligned trigger). Pass `align="left"` for a trigger that isn't
 * right-aligned (e.g. an inline text link), so the panel opens without
 * running off the left edge of the viewport. */
export function dropdownPanelClass(align: "left" | "right" = "right") {
  return [
    "absolute z-30 mt-2 w-64 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-md",
    align === "right" ? "right-0" : "left-0",
  ].join(" ");
}
