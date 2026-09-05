import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]">
      <table className="min-w-full text-left text-sm">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)] text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-muted)]">
      <tr>{children}</tr>
    </thead>
  );
}

export function Th({ children, className = "", ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th scope="col" className={["px-4 py-3.5 font-semibold", className].join(" ")} {...props}>
      {children}
    </th>
  );
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function Tr({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <tr className={["border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-subtle)]", className].join(" ")}>
      {children}
    </tr>
  );
}

export function Td({ children, className = "", ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={["px-4 py-4 align-middle", className].join(" ")} {...props}>
      {children}
    </td>
  );
}

export function TableSkeleton({ columns, rows = 5 }: { columns: number; rows?: number }) {
  return (
    <Table>
      <THead>
        {Array.from({ length: columns }).map((_, i) => (
          <Th key={i}>
            <span className="skeleton block h-3 w-16" />
          </Th>
        ))}
      </THead>
      <TBody>
        {Array.from({ length: rows }).map((_, r) => (
          <Tr key={r}>
            {Array.from({ length: columns }).map((_, c) => (
              <Td key={c}>
                <span className="skeleton block h-4 w-full max-w-[10rem]" />
              </Td>
            ))}
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}
