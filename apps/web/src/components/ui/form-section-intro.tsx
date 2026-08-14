import type { ReactNode } from "react";

type Props = {
  icon?: ReactNode;
  title: string;
  description?: string;
};

export function FormSectionIntro({ icon, title, description }: Props) {
  return (
    <div className="flex items-start gap-2">
      {icon ? (
        <span className="mt-0.5 text-[var(--color-ink-muted)]" aria-hidden>
          {icon}
        </span>
      ) : null}
      <div>
        <h2 className="text-base font-semibold text-[var(--color-ink)]">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-sm text-[var(--color-ink-muted)]">{description}</p>
        ) : null}
      </div>
    </div>
  );
}
