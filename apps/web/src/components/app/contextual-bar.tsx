import Link from "next/link";

type Props = {
  label: string | null | undefined;
  href?: string | null;
};

export function ContextualBar({ label, href }: Props) {
  if (!label) return null;
  const className =
    "block border-b border-[var(--color-primary)]/15 bg-[var(--color-primary-subtle)] px-4 py-2 text-xs text-[var(--color-ink-muted)]";
  if (href) {
    return (
      <Link href={href} className={`${className} font-medium text-[var(--color-link)]`}>
        {label}
      </Link>
    );
  }
  return <div className={className}>{label}</div>;
}
