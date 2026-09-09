import { Button } from "@/components/ui/button";

/** A single failed block never takes down the rest of the page — this is
 * the understated inline fallback for it (never a full-screen error). */
export function BlockError({
  message = "Não foi possível carregar esta parte agora.",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3.5 py-2.5 text-sm text-[var(--color-ink-muted)]"
    >
      <span>{message}</span>
      {onRetry ? (
        <Button size="sm" variant="ghost" onClick={onRetry}>
          Tentar de novo
        </Button>
      ) : null}
    </div>
  );
}
