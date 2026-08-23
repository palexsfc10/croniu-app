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
  /**
   * "md" (44px) is the comfortable default — always use it for standalone
   * primary actions and anything on mobile. "sm" (36px) is for compact,
   * secondary, inline-with-text contexts (toolbar buttons, chips, filters)
   * where a full-height control would be visually heavier than the content
   * around it. Do not reach for arbitrary height classes on `className` —
   * that's exactly the drift (36/40/44px all in use for equivalent
   * contexts) this prop exists to close off.
   */
  size?: "sm" | "md";
  fullWidth?: boolean;
  /** Shows a spinner, disables the button, and sets aria-busy — use instead
   * of manually swapping the label to "Salvando…" and toggling `disabled`. */
  loading?: boolean;
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

const sizes: Record<NonNullable<Props["size"]>, string> = {
  md: "min-h-11 px-4 text-sm",
  sm: "min-h-9 px-3 text-sm",
};

function Spinner() {
  return (
    <svg
      className="h-4 w-4 shrink-0 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-90"
        d="M22 12a10 10 0 0 0-10-10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  fullWidth,
  loading = false,
  disabled,
  className = "",
  type = "button",
  ...props
}: Props) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={[
        "inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] font-semibold transition-[background-color,border-color,color,filter,opacity] duration-[var(--duration-fast)] disabled:cursor-not-allowed disabled:opacity-55",
        sizes[size],
        variants[variant],
        fullWidth ? "w-full" : "",
        className,
      ].join(" ")}
      {...props}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}
