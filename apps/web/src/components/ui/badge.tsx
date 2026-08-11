import type { ReactNode } from "react";

export type BadgeTone =
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral"
  | "progress"
  | "ai";

type Props = {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
};

const toneClass: Record<BadgeTone, string> = {
  primary: "badge-primary",
  success: "badge-success",
  warning: "badge-warning",
  danger: "badge-danger",
  info: "badge-info",
  neutral: "badge-neutral",
  progress: "badge-progress",
  ai: "badge-ai",
};

export function Badge({ children, tone = "neutral", className = "" }: Props) {
  return <span className={["badge", toneClass[tone], className].join(" ")}>{children}</span>;
}
