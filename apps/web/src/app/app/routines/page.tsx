"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import RoutinesPageInner from "./routines-inner";

function RoutinesKeyed() {
  const search = useSearchParams();
  const scope = search.get("clientId") || "org";
  return <RoutinesPageInner key={scope} />;
}

export default function RoutinesPage() {
  return (
    <Suspense fallback={<p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p>}>
      <RoutinesKeyed />
    </Suspense>
  );
}
