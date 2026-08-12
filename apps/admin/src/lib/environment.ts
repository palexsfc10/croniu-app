/** Canonical Croniu environment presentation for Admin chrome. */

export type CroniuEnvironment =
  | "production"
  | "hml"
  | "development"
  | "test"
  | "unknown";

export type EnvironmentPresentation = {
  canonical: CroniuEnvironment;
  badge: string;
  description: string;
  headline: string;
  tone: "production" | "hml" | "neutral" | "unknown";
};

const PRODUCTION = new Set(["production", "prd", "prod"]);
const HML = new Set(["hml", "homologation", "homologacao", "homologação", "staging"]);
const DEVELOPMENT = new Set(["development", "dev", "local"]);
const TEST = new Set(["test", "testing"]);

export function normalizeCroniuEnvironment(raw: string | null | undefined): CroniuEnvironment {
  const value = (raw ?? "").trim().toLowerCase();
  if (!value) return "unknown";
  if (PRODUCTION.has(value) || value === "production") return "production";
  if (HML.has(value) || value === "hml") return "hml";
  if (DEVELOPMENT.has(value) || value === "development") return "development";
  if (TEST.has(value) || value === "test") return "test";
  if (value === "unknown") return "unknown";
  return "unknown";
}

export function presentCroniuEnvironment(
  raw: string | null | undefined,
): EnvironmentPresentation {
  const canonical = normalizeCroniuEnvironment(raw);
  switch (canonical) {
    case "production":
      return {
        canonical,
        badge: "Produção",
        description: "Painel operacional de produção",
        headline: "Produção",
        tone: "production",
      };
    case "hml":
      return {
        canonical,
        badge: "HML",
        description: "Painel operacional de homologação",
        headline: "HML",
        tone: "hml",
      };
    case "development":
      return {
        canonical,
        badge: "Desenvolvimento",
        description: "Painel operacional de desenvolvimento",
        headline: "Desenvolvimento",
        tone: "neutral",
      };
    case "test":
      return {
        canonical,
        badge: "Teste",
        description: "Painel operacional de teste",
        headline: "Teste",
        tone: "neutral",
      };
    default:
      return {
        canonical: "unknown",
        badge: "Ambiente desconhecido",
        description: "Identidade de ambiente não confirmada",
        headline: "Ambiente desconhecido",
        tone: "unknown",
      };
  }
}

export function environmentBadgeClassName(tone: EnvironmentPresentation["tone"]): string {
  if (tone === "production") {
    return "bg-emerald-500/15 text-emerald-900";
  }
  if (tone === "hml") {
    return "bg-amber-500/15 text-amber-800";
  }
  if (tone === "unknown") {
    return "bg-[var(--color-surface-muted)] text-[var(--color-ink-muted)]";
  }
  return "bg-[var(--color-surface-muted)] text-[var(--color-ink-muted)]";
}
