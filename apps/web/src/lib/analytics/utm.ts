/**
 * Same allowlist as croniu-site's `src/lib/analytics/utm.ts` — these are the
 * only params that survive the hop from croniu.com.br/app-cta-link.tsx into
 * app.croniu.com.br?utm_source=...&gclid=....
 */
export const TRACKED_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "gclid",
] as const;

export type TrackedParams = Partial<Record<(typeof TRACKED_PARAMS)[number], string>>;

export function pickTrackedParams(search: string): TrackedParams {
  const params = new URLSearchParams(search);
  const picked: TrackedParams = {};
  for (const key of TRACKED_PARAMS) {
    const value = params.get(key);
    if (value) picked[key] = value;
  }
  return picked;
}
