import Link from "next/link";
import { IconSparkles } from "@/components/ui/icons";
import { buildAssistantHref } from "@/lib/assistant-link";

type Props = {
  prompt: string;
  context: string;
  returnTo: string;
  /** "pill": compact, icon + short label, for a header row (Home, Renovações,
   * Agenda). "banner": full-width block with room for a longer contextual
   * sentence, for a mobile-only CTA at the bottom of a list (Ciclos,
   * Financeiro, Cadastros pendentes). */
  variant?: "pill" | "banner";
  children: string;
  className?: string;
};

const base =
  "inline-flex items-center gap-1.5 font-semibold text-[var(--color-ink)] transition-colors";

const variants: Record<NonNullable<Props["variant"]>, string> = {
  pill: "min-h-10 rounded-full border border-[var(--color-ai-border)] bg-[var(--color-ai-subtle)] px-3 py-1.5 text-sm text-[var(--color-ai-hover)] hover:bg-[var(--color-ai-subtle)]/70",
  banner:
    "block w-full rounded-[var(--radius-lg)] border border-[var(--color-primary)]/30 bg-[var(--color-primary-subtle)]/40 px-3.5 py-3 text-sm",
};

/**
 * The "Perguntar à Cronia" entry point — was 4 visually different
 * implementations (a rounded-full AI pill, a `Button variant="secondary"`,
 * a full-width banner, a small primary-tinted chip) across 8 screens, all
 * linking to the same `/app/assistant?prompt=…` shape. One component, two
 * real variants.
 */
export function AskAssistantLink({ prompt, context, returnTo, variant = "pill", children, className = "" }: Props) {
  const href = buildAssistantHref(prompt, context, returnTo);
  return (
    <Link href={href} className={`${base} ${variants[variant]} ${className}`}>
      {variant === "pill" ? <IconSparkles className="h-4 w-4" aria-hidden /> : null}
      {children}
    </Link>
  );
}
