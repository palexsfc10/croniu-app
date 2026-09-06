"use client";

import { useCallback, useState } from "react";

export type ToastTone = "neutral" | "success" | "danger";

export type ToastItem = {
  id: string;
  message: string;
  tone: ToastTone;
};

const toneClass: Record<ToastTone, string> = {
  neutral: "border-[var(--color-border)] bg-[var(--color-ink)] text-white",
  success: "border-[var(--color-success)]/25 bg-[var(--color-success)] text-white",
  danger: "border-[var(--color-danger)]/25 bg-[var(--color-danger)] text-white",
};

/**
 * A brief transient confirmation ("Alterações salvas", "Não foi possível
 * copiar") — distinct from `BlockError` (a persistent inline failure for a
 * whole block) and `ConfirmDialog`/`ActionSheet` (blocking, needs a
 * decision). No page currently uses this; it exists so a future save-flow
 * that genuinely needs a toast doesn't reinvent one. Render `<ToastStack
 * toasts={...} />` once near the root of whatever tree owns `useToasts()`.
 */
export function ToastStack({ toasts }: { toasts: ToastItem[] }) {
  if (!toasts.length) return null;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:bottom-6"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`pointer-events-auto max-w-sm rounded-[var(--radius-md)] border px-4 py-2.5 text-sm font-medium shadow-md ${toneClass[t.tone]}`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

/** Local, self-contained toast queue — auto-dismisses after `durationMs`.
 * Not a global singleton on purpose: a page/flow that needs toasts owns its
 * own `useToasts()` and renders its own `<ToastStack>`. */
export function useToasts(durationMs = 3200) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const push = useCallback(
    (message: string, tone: ToastTone = "neutral") => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, message, tone }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, durationMs);
    },
    [durationMs],
  );

  return { toasts, push };
}
