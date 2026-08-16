type Props = { children: string; id?: string };

export function FieldHint({ children, id }: Props) {
  return (
    <p id={id} className="text-xs leading-relaxed text-[var(--color-ink-muted)]">
      {children}
    </p>
  );
}
