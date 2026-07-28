import type { ButtonHTMLAttributes, ReactNode } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: "primary" | "brand" | "secondary" | "ghost";
  fullWidth?: boolean;
};

/** All variants share a light brand wash (subtle on light screens). */
const variants: Record<NonNullable<Props["variant"]>, string> = {
  primary: "btn-brand-soft",
  brand: "btn-brand-soft",
  secondary: "btn-brand-soft",
  ghost: "btn-brand-soft",
};

export function Button({
  children,
  variant = "primary",
  fullWidth,
  className = "",
  type = "button",
  ...props
}: Props) {
  return (
    <button
      type={type}
      className={[
        "inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] px-4 text-sm font-semibold transition-[filter,opacity] duration-[var(--duration-fast)] disabled:cursor-not-allowed disabled:opacity-60",
        variants[variant],
        fullWidth ? "w-full" : "",
        className,
      ].join(" ")}
      {...props}
    >
      {children}
    </button>
  );
}
