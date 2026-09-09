import Link from "next/link";
import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  href?: string;
  className?: string;
  /** Element used when there's no `href` (a card with several links/actions
   * inside, not one navigation target) — "li" when it's the direct child
   * of a `<ul>`. Ignored when `href` is set (always an anchor then). */
  as?: "div" | "li";
};

/**
 * The mobile "row card" surface — border, radius, shadow, bg — that 13
 * pages each rebuilt slightly differently for their `lg:hidden` list.
 * Deliberately owns no `display` or padding: some of those cards stack
 * text (`block`, `px-3.5 py-3`), others lay an avatar out in a row (`flex
 * items-center gap-3.5`, `px-4 py-3`) — since Tailwind utility classes
 * don't reliably override by DOM order, baking in one `display` here
 * would silently break whichever caller needs the other. Pass layout and
 * padding via `className`. Renders an anchor when `href` is given (the
 * common case: the whole card navigates), otherwise a plain
 * `<li>`-friendly `<div>`.
 */
export function ListCard({ children, href, className = "", as = "div" }: Props) {
  const classes = [
    "rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm transition-all",
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
  if (as === "li") {
    return <li className={classes}>{children}</li>;
  }
  return <div className={classes}>{children}</div>;
}
