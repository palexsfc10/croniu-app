import { Button } from "./button";
import { IconAlertTriangle } from "./icons";

export function ResourceError({ message, retry }: { message: string; retry: () => void }) {
  return <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-danger-border)] bg-[var(--color-danger-subtle)] p-4">
    <IconAlertTriangle className="h-5 w-5 shrink-0 text-[var(--color-danger)]" />
    <p role="alert" className="min-w-0 flex-1 text-sm text-[var(--color-danger)]">{message}</p>
    <Button variant="secondary" onClick={retry}>Tentar novamente</Button>
  </div>;
}
