import Link from "next/link";
import { IconChevronRight } from "@/components/ui/icons";

export function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Trilha de navegação" className="flex flex-wrap items-center gap-1 text-sm">
      {items.map((item, index) => {
        const last = index === items.length - 1;
        return (
          <span key={`${item.label}-${index}`} className="flex items-center gap-1">
            {index > 0 ? <IconChevronRight className="h-3.5 w-3.5 text-[var(--color-ink-faint)]" /> : null}
            {item.href && !last ? (
              <Link
                href={item.href}
                className="font-medium text-[var(--color-ink-muted)] hover:text-[var(--color-primary)]"
              >
                {item.label}
              </Link>
            ) : (
              <span aria-current={last ? "page" : undefined} className="font-semibold text-[var(--color-ink)]">
                {item.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
