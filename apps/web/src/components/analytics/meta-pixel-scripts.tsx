"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { CONSENT_UPDATED_EVENT, getStoredConsent } from "@/lib/analytics/consent";
import { META_PIXEL_ID, isMetaPixelScriptAllowed } from "@/lib/analytics/meta-pixel";
import { isSensitiveTokenRoute } from "@/lib/analytics/sensitive-routes";

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CONSENT_UPDATED_EVENT, onChange);
  return () => window.removeEventListener(CONSENT_UPDATED_EVENT, onChange);
}
function getSnapshot(): boolean {
  return getStoredConsent()?.marketing === true;
}
function getServerSnapshot(): boolean {
  return false;
}

/**
 * Meta Pixel base code — injected only once the visitor has explicitly
 * granted "marketing" consent (see consent-banner.tsx) on top of the
 * env/host gate (isMetaPixelScriptAllowed). Fires its own initial
 * `PageView`, same as Meta's standard snippet; SPA route changes are not
 * separately tracked for the Pixel (out of scope of this delivery — only
 * the GA4 page_view stream has the SPA dedup requirement).
 *
 * Never injected while the current route is `/entrar/[token]` or
 * `/c/[token]` — fbq's automatic PageView reads `window.location.href` into
 * a tracked `dl` param, which would otherwise leak the bearer token to Meta
 * (the GTM container has no such auto-fire and is protected differently, by
 * RoutePageviewTracker simply never calling trackPageView on these routes).
 */
export function MetaPixelScripts({ isHml }: { isHml: boolean }) {
  const marketingConsent = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const pathname = usePathname();
  // Second, independent, client-only check (zero static-generation cost,
  // same reasoning as GtmContainerScript's inline hostname guard): even if
  // `isHml` (from CRONIU_ENV) were ever wrong for a request that still
  // resolves to the HML host, this refuses to load there too.
  const isHmlHost = typeof window !== "undefined" && window.location.hostname.startsWith("croniu-hml");
  if (!isMetaPixelScriptAllowed(isHml, marketingConsent) || isHmlHost || isSensitiveTokenRoute(pathname)) {
    return null;
  }
  return (
    <>
      <Script id="meta-pixel" strategy="afterInteractive">
        {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${META_PIXEL_ID}');
fbq('track', 'PageView');`}
      </Script>
      <noscript>
        <img
          height="1"
          width="1"
          alt=""
          style={{ display: "none" }}
          src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
        />
      </noscript>
    </>
  );
}
