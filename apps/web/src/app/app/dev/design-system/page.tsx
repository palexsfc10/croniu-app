import { headers } from "next/headers";
import { notFound } from "next/navigation";
import DesignSystemPageClient from "./design-system-client";

/**
 * Server-side gate — real, not the earlier client-side hostname check
 * (`useIsHmlOrDevEnvironment`, still kept in the client component as a
 * harmless secondary layer). A request's `Host` header is only knowable
 * server-side per-request; checking it here means a direct hit on this
 * route in PRD gets Next's actual `notFound()` (a real 404 response)
 * before any of this page's HTML or client JS ever ships — not just a
 * client-rendered "Não disponível" message that still shipped the bundle.
 * Same hostname convention as everywhere else in the app (`croniu-hml*`);
 * local dev is allowed via `NODE_ENV`, matching how nothing here needs a
 * new env var wired through both `compose.hml.yaml` and `compose.prd.yaml`.
 */
export default async function DesignSystemPage() {
  const hostHeader = (await headers()).get("host") || "";
  const isHml = hostHeader.startsWith("croniu-hml");
  const isDev = process.env.NODE_ENV === "development";
  if (!isHml && !isDev) {
    notFound();
  }
  return <DesignSystemPageClient />;
}
