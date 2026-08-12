"use client";

import {
  environmentBadgeClassName,
  presentCroniuEnvironment,
  type EnvironmentPresentation,
} from "@/lib/environment";

type Props = {
  environment: string | null | undefined;
  showDescription?: boolean;
  className?: string;
};

export function EnvironmentIdentity({
  environment,
  showDescription = true,
  className,
}: Props) {
  const presentation = presentCroniuEnvironment(environment);
  return (
    <div className={className}>
      <EnvironmentBadge presentation={presentation} />
      {showDescription ? (
        <p className="mt-1 text-xs text-[var(--color-ink-muted)]">{presentation.description}</p>
      ) : null}
    </div>
  );
}

export function EnvironmentBadge({
  environment,
  presentation: provided,
  className,
}: {
  environment?: string | null;
  presentation?: EnvironmentPresentation;
  className?: string;
}) {
  const presentation = provided ?? presentCroniuEnvironment(environment);
  return (
    <p
      className={[
        "inline-flex items-center rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide",
        environmentBadgeClassName(presentation.tone),
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {presentation.badge}
    </p>
  );
}
