"use client";

import Link from "next/link";
import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  icon?: ReactNode;
  href?: string;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  external?: boolean;
  /** Set to "menuitem" when the row lives inside a `role="menu"` popover —
   * ARIA menus require it on every item. Omitted (the default) for rows
   * used in a plain list/panel, e.g. Cliente 360°'s "Mais ações". */
  role?: "menuitem";
};

function classes(danger: boolean, disabled: boolean) {
  return [
    "flex min-h-11 w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-2 text-left text-sm transition-colors",
    danger
      ? "text-[var(--color-danger)] hover:bg-[var(--color-danger-subtle)] focus-visible:bg-[var(--color-danger-subtle)]"
      : "text-[var(--color-ink)] hover:bg-[var(--color-surface-subtle)] focus-visible:bg-[var(--color-surface-subtle)]",
    disabled ? "pointer-events-none opacity-55" : "",
  ].join(" ");
}

/**
 * One row inside a dropdown/popover menu — icon + label, hover fill, an
 * optional danger tone, an optional disabled state. Every menu (account
 * dropdown, Cliente 360° actions, any future one) was rebuilding this same
 * row from scratch with nearly-identical classNames; this is the one place
 * now. Not `Button`: a menu row is full-width and left-aligned, a different
 * visual role than a standalone action.
 */
export function MenuItem({
  children,
  icon,
  href,
  onClick,
  danger = false,
  disabled = false,
  external = false,
  role,
}: Props) {
  const content = (
    <>
      {icon}
      {children}
    </>
  );

  if (href) {
    if (external) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          role={role}
          className={classes(danger, disabled)}
          onClick={onClick}
        >
          {content}
        </a>
      );
    }
    return (
      <Link href={href} role={role} className={classes(danger, disabled)} onClick={onClick}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      role={role}
      className={classes(danger, disabled)}
      disabled={disabled}
      onClick={onClick}
    >
      {content}
    </button>
  );
}
