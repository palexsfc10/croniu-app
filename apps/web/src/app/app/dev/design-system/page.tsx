import { headers } from "next/headers";
import { notFound } from "next/navigation";
import DesignSystemPageClient from "./design-system-client";

/**
 * Server-side gate — real, not the earlier client-side hostname check
 * (`useIsHmlOrDevEnvironment`, still kept in the client component as a
 * harmless secondary layer). Two independent server-side signals, either
 * one sufficient to allow: the request's `Host` header (only knowable
 * per-request, server-side) starting with `croniu-hml`, or the explicit
 * `CRONIU_ENV=hml` env var set on the HML web container
 * (`deploy/hml/compose.hml.yaml`) — `compose.prd.yaml` deliberately never
 * sets it, so its *absence* is what keeps this closed in PRD even if the
 * Host check alone were ever fooled (a proxy rewrite, a misconfigured
 * domain). Local dev is allowed via `NODE_ENV`. A direct hit on this route
 * outside all three gets Next's real `notFound()` — a genuine 404 before
 * any of this page's HTML or client JS ships, not just a client-rendered
 * "Não disponível" message that still shipped the bundle. This does
 * depend on `CRONIU_ENV` actually being set on the HML container by
 * whatever compose file is live at deploy time — documented, not assumed.
 */
export default async function DesignSystemPage() {
  const hostHeader = (await headers()).get("host") || "";
  const isHml = hostHeader.startsWith("croniu-hml") || process.env.CRONIU_ENV === "hml";
  const isDev = process.env.NODE_ENV === "development";
  if (!isHml && !isDev) {
    notFound();
  }
  return <DesignSystemPageClient />;
}
