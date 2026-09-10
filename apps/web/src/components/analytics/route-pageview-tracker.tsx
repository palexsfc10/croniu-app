"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { trackPageView } from "@/lib/analytics/gtm";
import { isSensitiveTokenRoute, sanitizeReferrer } from "@/lib/analytics/sensitive-routes";

/**
 * Pushes one `page_view` per real route change — initial load included,
 * `/register` included, same as croniu-site's RoutePageviewTracker. A ref
 * guards against the double-invoke React does in dev/StrictMode, so the
 * very first pageview never fires twice.
 *
 * `/entrar/[token]` and `/c/[token]` are skipped entirely — see
 * sensitive-routes.ts. This is the one deliberate divergence from
 * "one page_view per route change": those two prefixes never get one, by
 * design, not because of a bug.
 *
 * The GTM container's GA4 Configuration tag must have "Send a page view
 * event when this configuration loads" turned OFF and instead trigger off
 * this dataLayer event, exactly like croniu-site — otherwise every pageview
 * here would be double-counted (that toggle lives in the GTM UI, outside
 * this repo).
 */
export function RoutePageviewTracker() {
  const pathname = usePathname();
  const lastTracked = useRef<string | null>(null);

  useEffect(() => {
    if (lastTracked.current === pathname) return;
    lastTracked.current = pathname;
    if (isSensitiveTokenRoute(pathname)) return;

    trackPageView({
      page_location: window.location.href,
      page_path: pathname,
      page_title: document.title,
      page_referrer: sanitizeReferrer(document.referrer, window.location.origin),
    });
  }, [pathname]);

  return null;
}
