"use client";

import { Suspense } from "react";
import RoutinesPageInner from "./routines-inner";

export default function RoutinesPage() {
  return (
    <Suspense fallback={<p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p>}>
      <RoutinesPageInner />
    </Suspense>
  );
}
