import type { ImgHTMLAttributes } from "react";

export type BrandMarkSize = "xs" | "sm" | "md" | "lg";

const SIZE_PX: Record<BrandMarkSize, number> = {
  xs: 20,
  sm: 28,
  md: 40,
  lg: 56,
};

export type BrandMarkProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "src" | "alt" | "width" | "height"
> & {
  size?: BrandMarkSize;
  /** Decorative when paired with visible “Croniu” text nearby */
  decorative?: boolean;
};

/**
 * Croniu app mark (letter C, transparent cutout for UI chrome).
 * Asset: public/brand/croniu-mark.png (UI cutout only).
 * Official solid tile for favicon/PWA: assets/brand/croniu-c-official.png
 * → public/icons/icon-*-v3.png (see scripts/generate_favicon_assets.py).
 */
export function BrandMark({
  size = "sm",
  decorative = false,
  className = "",
  ...rest
}: BrandMarkProps) {
  const px = SIZE_PX[size];
  return (
    <img
      src="/brand/croniu-mark.png"
      width={px}
      height={px}
      alt={decorative ? "" : "Croniu"}
      aria-hidden={decorative || undefined}
      className={["shrink-0 object-contain", className].filter(Boolean).join(" ")}
      {...rest}
    />
  );
}
