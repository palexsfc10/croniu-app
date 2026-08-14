/** Central profession/capability config. Screens should read this, not branch on profession. */

import { canonicalProfessionCode, nomenclatureFor } from "@/lib/nomenclature";

export type CapabilityId =
  | "people"
  | "agenda"
  | "classes"
  | "workouts"
  | "cycles"
  | "evaluations"
  | "plans"
  | "sessions"
  | "followups";

const PRESETS: Record<string, CapabilityId[]> = {
  personal_trainer: ["people", "workouts", "cycles", "classes", "evaluations"],
  nutritionist: ["people", "sessions", "plans", "evaluations", "followups"],
  private_tutor: ["people", "classes", "agenda", "plans", "sessions"],
  sports_teacher: ["people", "classes", "evaluations", "cycles"],
  consultant: ["people", "sessions", "plans", "followups"],
  coach_mentor: ["people", "sessions", "plans", "followups"],
  physiotherapist: ["people", "sessions", "plans", "evaluations", "followups"],
  therapist: ["people", "sessions", "plans", "evaluations", "followups"],
  aesthetics: ["people", "sessions", "agenda", "evaluations"],
  other: ["people", "agenda", "plans"],
};

const USE_CASE_CAPS: Record<string, CapabilityId[]> = {
  appointments_agenda: ["agenda", "sessions"],
  classes: ["classes", "agenda"],
  workouts: ["workouts"],
  evaluations: ["evaluations"],
  plans_cycles: ["plans", "cycles"],
  protocols: ["plans"],
  periodic_feedback: ["followups"],
  consulting: ["sessions", "plans", "followups"],
  other: [],
};

export function resolveCapabilities(
  professionCode: string | null | undefined,
  useCases: string[] | null | undefined,
): CapabilityId[] {
  const code = canonicalProfessionCode(professionCode) ?? "other";
  const preset = PRESETS[code] ?? PRESETS.other;
  const extras = (useCases ?? []).flatMap((item) => USE_CASE_CAPS[item] ?? []);
  const seen = new Set<CapabilityId>();
  const ordered: CapabilityId[] = [];
  for (const cap of [...preset, ...extras]) {
    if (seen.has(cap)) continue;
    seen.add(cap);
    ordered.push(cap);
  }
  return ordered;
}

function labelFor(cap: CapabilityId, professionCode: string | null | undefined): string {
  const terms = nomenclatureFor(professionCode);
  const code = canonicalProfessionCode(professionCode);
  switch (cap) {
    case "people":
      return terms.clients;
    case "agenda":
      return terms.agenda;
    case "classes":
      return code === "personal_trainer" ? "aulas e treinos" : "aulas";
    case "workouts":
      return "treinos";
    case "cycles":
      return terms.cycle + "s";
    case "evaluations":
      return code === "nutritionist" ? "avaliações e evoluções" : terms.evaluation + "s";
    case "plans":
      return terms.plan_short + "s";
    case "sessions":
      return terms.session + "s";
    case "followups":
      return code === "nutritionist" || code === "consultant" || code === "coach_mentor"
        ? "retornos"
        : "acompanhamento";
    default:
      return cap;
  }
}

export type ExperienceItem = { id: CapabilityId; text: string };

export type ExperienceSummary = {
  visible: boolean;
  blurb: string;
  items: ExperienceItem[];
};

export function registerExperienceSummary(
  professionCode: string | null | undefined,
  useCases: string[] | null | undefined,
): ExperienceSummary {
  if (!professionCode) {
    return { visible: false, blurb: "", items: [] };
  }
  const code = canonicalProfessionCode(professionCode) ?? "other";
  const preset = new Set(PRESETS[code] ?? PRESETS.other);
  const resolved = resolveCapabilities(professionCode, useCases);
  const extras = resolved.filter((cap) => !preset.has(cap));
  const source = extras.length ? extras : resolved.slice(0, 4);
  const items = source.slice(0, 4).map((id) => ({ id, text: labelFor(id, professionCode) }));
  const uniqueText = [...new Set(items.map((item) => item.text))];
  if (uniqueText.length === 0) {
    return { visible: false, blurb: "", items: [] };
  }
  const blurb =
    extras.length > 0
      ? "Além do preset da profissão, sua rotina também inclui:"
      : "Com base na sua área, o Croniu organiza:";
  return {
    visible: true,
    blurb,
    items: uniqueText.map((text) => items.find((item) => item.text === text)!),
  };
}
