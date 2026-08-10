import type { HTMLAttributes } from "react";

export type BrandWordmarkSize = "sm" | "md" | "lg" | "xl";
export type BrandWordmarkSurface = "light" | "dark";

export type BrandWordmarkProps = HTMLAttributes<HTMLSpanElement> & {
  size?: BrandWordmarkSize;
  surface?: BrandWordmarkSurface;
  /** Tighter tracking for dense headers */
  compact?: boolean;
};

/**
 * Official Croniu wordmark: bold "Cron" + "iu" with ink→primary gradient.
 * Screen readers receive a single accessible name: "Croniu".
 *
 * Keep in sync with apps/admin/src/components/brand/brand-wordmark.tsx
 * and packages/brand (canonical reference).
 */
export function BrandWordmark({
  size = "md",
  surface = "light",
  compact = false,
  className = "",
  ...rest
}: BrandWordmarkProps) {
  const classes = [
    "brand-wordmark",
    `brand-wordmark--${size}`,
    `brand-wordmark--on-${surface}`,
    compact ? "brand-wordmark--compact" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes} role="img" aria-label="Croniu" {...rest}>
      <span className="brand-wordmark__cron" aria-hidden="true">
        Cron
      </span>
      <span className="brand-wordmark__iu" aria-hidden="true">
        iu
      </span>
    </span>
  );
}
