import Link from "next/link";

type Props = {
  href: string;
  label: string;
};

/** Subtle back control used across nested app screens. */
export function BackLink({ href, label }: Props) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)]"
    >
      <span aria-hidden="true" className="text-[0.95rem] font-normal leading-none opacity-60">
        ←
      </span>
      <span>{label}</span>
    </Link>
  );
}
