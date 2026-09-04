import Link from "next/link";
import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  href?: string;
  className?: string;
};

/**
 * The mobile "row card" chrome — border, radius, shadow, padding — that 13
 * pages each rebuilt slightly differently for their `lg:hidden` list. This
 * owns only the surface; each page still composes its own content inside.
 * Renders an anchor when `href` is given (the common case: the whole card
 * navigates), otherwise a plain `<li>`-friendly `<div>`.
 */
export function ListCard({ children, href, className = "" }: Props) {
  const classes = [
    "block rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-3 shadow-sm transition-all",
    href ? "hover:-translate-y-px hover:shadow-md" : "",
    className,
  ].join(" ");

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }
  return <div className={classes}>{children}</div>;
}
