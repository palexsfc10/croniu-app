import type { ReactNode } from "react";

/**
 * The desktop-table chrome every table page (Ciclos, Recebíveis, Renovações,
 * Rotinas, Acompanhamentos, Serviços, Intake) rebuilt by hand — border,
 * radius, shadow, and the horizontal-scroll container so a wide table never
 * pushes the page itself sideways. Wrap a real `<table>`; this owns none of
 * the columns or rows.
 */
export function TableShell({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)]/80 bg-[var(--color-surface)]">
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

/** The one `<thead>` cell style — uppercase, muted, tracked-out label. */
export function Th({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <th
      className={`px-3.5 py-2.5 text-left text-xs font-semibold tracking-wide text-[var(--color-ink-muted)] uppercase ${className}`}
    >
      {children}
    </th>
  );
}

/** A body row with the shared bottom hairline (last row has none). */
export function Tr({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <tr className={`border-b border-[var(--color-border)]/50 last:border-b-0 ${className}`}>
      {children}
    </tr>
  );
}

/** A body cell with the shared padding. */
export function Td({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={`px-3.5 py-3 text-sm ${className}`}>{children}</td>;
}
