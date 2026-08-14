import type { Chip } from "@/lib/form-guidance";

type Props = {
  chips: Chip[];
  onSelect: (value: string) => void;
  label?: string;
};

export function SuggestionChips({ chips, onSelect, label = "Sugestões" }: Props) {
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {chips.map((chip) => (
        <button
          key={chip.label}
          type="button"
          className="min-h-9 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3 text-xs font-medium text-[var(--color-ink-muted)]"
          onClick={() => onSelect(chip.value)}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
