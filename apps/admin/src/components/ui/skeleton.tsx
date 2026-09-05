export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={["skeleton block", className].join(" ")} aria-hidden="true" />;
}

export function SkeletonMetricGrid({ count = 8 }: { count?: number }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" role="status" aria-label="Carregando métricas">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-2 h-7 w-14" />
        </div>
      ))}
    </div>
  );
}
