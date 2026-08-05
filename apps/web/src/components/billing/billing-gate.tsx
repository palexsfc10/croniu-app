"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import type { BillingEntitlement } from "@/lib/billing";

const ALLOW_WITHOUT_ACCESS = [
  "/app/billing",
  "/app/trial-expired",
  "/app/profile",
  "/app/manual",
];

/**
 * Gates the authenticated app shell on SaaS entitlement.
 * Public portal `/c/*` is outside this layout — never blocked here.
 */
export function BillingGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const allowed = ALLOW_WITHOUT_ACCESS.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
      );
      if (allowed) {
        if (!cancelled) setReady(true);
        return;
      }
      const result = await apiFetch<BillingEntitlement>("/api/v1/billing/entitlement");
      if (cancelled) return;
      if (result.error) {
        // Fail open on transient errors so ops/debug still work; UI shows errors elsewhere.
        setReady(true);
        return;
      }
      const ent = result.data;
      if (ent && !ent.has_active_access && !ent.can_write) {
        router.replace("/app/trial-expired");
        return;
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  if (!ready) {
    return (
      <p className="px-4 py-6 text-sm text-[var(--color-ink-muted)]" role="status">
        Verificando assinatura…
      </p>
    );
  }

  return <>{children}</>;
}
