/**
 * `/entrar/[token]` and `/c/[token]` carry a bearer capability token directly
 * in the path — whoever holds it gets in, no session required (see the
 * `/api/v1/public/my-cycle/:token` calls in `app/c/[token]/page.tsx`). That's
 * exactly why `next.config.ts` already sends `Referrer-Policy: no-referrer`
 * and `X-Robots-Tag: noindex` for these two route prefixes. Analytics must
 * honor the same boundary: never let a token reach GA4/Meta as a page path,
 * page location, or referrer — a leaked token is a portal/account takeover,
 * not just a privacy nit.
 */
const TOKEN_ROUTE_PREFIXES = ["/entrar/", "/c/"] as const;

export function isSensitiveTokenRoute(pathname: string): boolean {
  return TOKEN_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/** Same-origin referrer scrubbed of a token path segment; anything else passed through. */
export function sanitizeReferrer(referrer: string, currentOrigin: string): string | undefined {
  if (!referrer) return undefined;
  try {
    const url = new URL(referrer);
    if (url.origin === currentOrigin && isSensitiveTokenRoute(url.pathname)) {
      return undefined;
    }
  } catch {
    return referrer;
  }
  return referrer;
}
