/** Feedback helpers — no support e-mail, no mailto. */

export const FEEDBACK_CATEGORIES = [
  { value: "suggestion", label: "Sugestão" },
  { value: "problem", label: "Problema" },
  { value: "question", label: "Dúvida" },
  { value: "praise", label: "Elogio" },
  { value: "other", label: "Outro" },
] as const;

export type FeedbackCategoryValue = (typeof FEEDBACK_CATEGORIES)[number]["value"];

export const FEEDBACK_MESSAGE_MIN = 10;
export const FEEDBACK_MESSAGE_MAX = 2000;
export const FEEDBACK_SUBJECT_MAX = 120;

export function buildTechnicalContext(pathname: string) {
  const w = typeof window !== "undefined" ? window.innerWidth : 0;
  const h = typeof window !== "undefined" ? window.innerHeight : 0;
  let device_kind: "mobile" | "tablet" | "desktop" | "unknown" = "unknown";
  if (w > 0) {
    if (w < 768) device_kind = "mobile";
    else if (w < 1024) device_kind = "tablet";
    else device_kind = "desktop";
  }
  const isStandalone =
    typeof window !== "undefined" &&
    (window.matchMedia("(display-mode: standalone)").matches ||
      // @ts-expect-error iOS Safari
      Boolean(window.navigator.standalone));
  return {
    route: pathname.slice(0, 200),
    app_version: process.env.NEXT_PUBLIC_APP_VERSION || "hml",
    device_kind,
    viewport: w && h ? `${w}x${h}` : undefined,
    client_mode: isStandalone ? ("pwa" as const) : ("browser" as const),
    client_timestamp: new Date().toISOString(),
  };
}
