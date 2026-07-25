import Link from "next/link";

type Props = {
  label: string | null | undefined;
  href?: string | null;
};

export function ContextualBar({ label, href }: Props) {
  if (!label) return null;
  const className =
    "block border-b border-[var(--color-border)]/70 bg-[var(--color-surface-muted)] px-4 py-2 text-xs text-[var(--color-ink-muted)]";
  if (href) {
    return (
      <Link href={href} className={`${className} font-medium text-[var(--color-primary)]`}>
        {label}
      </Link>
    );
  }
  return <div className={className}>{label}</div>;
}
