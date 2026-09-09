type Props = {
  /** Pre-computed initials (e.g. from `clientInitials`) — this component
   * never derives them, so callers keep control of the exact rule. */
  initials: string;
  size?: "sm" | "md" | "lg";
};

const sizes: Record<NonNullable<Props["size"]>, string> = {
  sm: "h-9 w-9 text-xs",
  md: "h-11 w-11 text-sm",
  lg: "h-14 w-14 text-base",
};

/** The initials circle used for a client/user across the app — was three
 * independently hand-rolled `rounded-full` spans with the same classes. */
export function Avatar({ initials, size = "md" }: Props) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-subtle)] font-semibold text-[var(--color-primary)] ${sizes[size]}`}
      aria-hidden
    >
      {initials}
    </span>
  );
}
