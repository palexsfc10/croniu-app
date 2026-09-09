import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
};

/**
 * The one page-level `<h1>` size. Before this, four different pages each
 * picked their own arbitrary bracket value (`text-[1.5rem] md:text-[1.875rem]`,
 * `text-3xl md:text-[2.25rem]`…) for what is visually the same role — and
 * three of them used `md:` (768px) to scale up, breaking the app's actual
 * `lg:` (1024px) breakpoint convention. One size, one breakpoint: 24px on
 * mobile/tablet, 30px from `lg:` up.
 */
export function PageTitle({ children, className = "" }: Props) {
  return (
    <h1 className={`h-display text-2xl text-[var(--color-ink)] lg:text-3xl ${className}`}>
      {children}
    </h1>
  );
}
