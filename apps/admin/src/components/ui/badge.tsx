import type { ReactNode } from "react";

export type BadgeTone = "primary" | "success" | "warning" | "danger" | "info" | "neutral";

export function Badge({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return <span className={["badge", `badge-${tone}`, className].filter(Boolean).join(" ")}>{children}</span>;
}
