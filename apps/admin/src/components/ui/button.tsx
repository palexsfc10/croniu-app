import type { ButtonHTMLAttributes, ReactNode } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  fullWidth?: boolean;
};

const variants = {
  primary: "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]",
  secondary:
    "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-ink)] hover:bg-[var(--color-surface-muted)]",
  ghost: "bg-transparent text-[var(--color-primary)] hover:bg-[var(--color-surface-muted)]",
  danger: "bg-[var(--color-danger)] text-white hover:bg-[var(--color-danger-hover)]",
};

const sizes = {
  sm: "min-h-9 px-3 text-xs",
  md: "min-h-11 px-4 text-sm",
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  fullWidth,
  className = "",
  type = "button",
  ...props
}: Props) {
  return (
    <button
      type={type}
      className={[
        "inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-md)] font-semibold transition-colors duration-[var(--duration-fast)] disabled:cursor-not-allowed disabled:opacity-60",
        sizes[size],
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
