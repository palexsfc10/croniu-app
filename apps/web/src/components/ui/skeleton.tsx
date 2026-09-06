export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] ${className}`}
    />
  );
}
