/** Safe post-auth path for public landing CTAs (same-origin app paths only). */
export function safeAuthNext(candidate: string | null | undefined): string | null {
  if (!candidate) return null;
  if (candidate === "/app" || candidate.startsWith("/app/")) {
    if (candidate.startsWith("//")) return null;
    if (candidate.includes("://")) return null;
    return candidate;
  }
  return null;
}

export function authHref(
  path: "/register" | "/login",
  next: string | null | undefined,
): string {
  const safe = safeAuthNext(next);
  if (!safe) return path;
  return `${path}?next=${encodeURIComponent(safe)}`;
}
