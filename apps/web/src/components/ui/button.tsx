import type { ButtonHTMLAttributes, ReactNode } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?:
    | "primary"
    | "secondary"
    | "outline"
    | "ghost"
    | "danger"
    | "success"
    | "ai"
    | "brand";
  fullWidth?: boolean;
};

const variants: Record<NonNullable<Props["variant"]>, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  outline: "btn-outline",
  ghost: "btn-ghost",
  danger: "btn-danger",
  success: "btn-success",
  ai: "btn-ai",
  brand: "btn-secondary",
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
        "inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] px-4 text-sm font-semibold transition-[background-color,border-color,color,filter,opacity] duration-[var(--duration-fast)] disabled:cursor-not-allowed disabled:opacity-55",
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
