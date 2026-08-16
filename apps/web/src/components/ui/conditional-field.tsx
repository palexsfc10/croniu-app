import type { ReactNode } from "react";

type Props = { when: boolean; children: ReactNode };

export function ConditionalField({ when, children }: Props) {
  if (!when) return null;
  return <div className="space-y-2">{children}</div>;
}
