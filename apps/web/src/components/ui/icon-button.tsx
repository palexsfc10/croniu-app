import type { ButtonHTMLAttributes, ReactNode } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: ReactNode;
  /** Required — an icon-only control with no visible label must always
   * name itself for assistive tech. */
  "aria-label": string;
  variant?: "ghost" | "outline" | "primary" | "danger";
  size?: "sm" | "md";
  active?: boolean;
};

const variants: Record<NonNullable<Props["variant"]>, string> = {
  ghost: "bg-transparent text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-ink)]",
  outline:
    "border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]",
  primary: "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:bg-[var(--color-primary-hover)]",
  danger: "bg-transparent text-[var(--color-ink-muted)] hover:bg-[var(--color-danger-subtle)] hover:text-[var(--color-danger)]",
};

const sizes: Record<NonNullable<Props["size"]>, string> = {
  md: "h-11 w-11",
  sm: "h-9 w-9",
};

/**
 * A single icon, no label — the sidebar's nav-collapsed state, table row
 * actions, a dismiss/close control. Always requires `aria-label` at the
 * type level so an icon-only control can never ship silently unlabeled.
 * For a labeled action, use `Button` instead (optionally with an icon as a
 * child) — this is not a smaller `Button`, it's a different control.
 */
export function IconButton({
  icon,
  variant = "ghost",
  size = "md",
  active = false,
  disabled,
  className = "",
  type = "button",
  ...props
}: Props) {
  return (
    <button
      type={type}
      disabled={disabled}
      aria-pressed={active || undefined}
      className={[
        "inline-flex shrink-0 items-center justify-center rounded-[var(--radius-md)] transition-colors duration-[var(--duration-fast)] disabled:cursor-not-allowed disabled:opacity-55",
        sizes[size],
        active ? "bg-[var(--color-primary-subtle)] text-[var(--color-primary)]" : variants[variant],
        className,
      ].join(" ")}
      {...props}
    >
      {icon}
    </button>
  );
}
