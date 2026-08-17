import type {
  AnamnesisConsentDef,
  AnamnesisQuestion,
  AnamnesisSchema,
  AnamnesisSection,
} from "@/lib/api";

export const REQUIRED_CONSENT_KEYS = [
  "purpose_science",
  "sensitive_health",
  "self_declared",
  "not_medical",
  "privacy_policy",
] as const;

export const OPTIONAL_CONSENT_KEYS = ["whatsapp_optional"] as const;

export const CONSENT_LABELS_PT: Record<string, string> = {
  purpose_science: "Declaro ciência da finalidade deste cadastro.",
  data_processing:
    "Autorizo o tratamento dos dados que informei, apenas para este profissional.",
  sensitive_health:
    "Autorizo o tratamento dos dados de saúde que declarei, apenas para este profissional.",
  self_declared: "Declaro que as respostas foram fornecidas por mim.",
  not_medical: "Estou ciente de que este formulário não substitui avaliação médica.",
  privacy_policy: "Li e aceito a política de privacidade.",
  whatsapp_optional: "Autorizo contato por WhatsApp (opcional).",
};

const GENERIC_FALLBACK_CONSENTS: AnamnesisConsentDef[] = [
  { key: "purpose_science", required: true, label: CONSENT_LABELS_PT.purpose_science },
  { key: "data_processing", required: true, label: CONSENT_LABELS_PT.data_processing },
  { key: "privacy_policy", required: true, label: CONSENT_LABELS_PT.privacy_policy },
  { key: "whatsapp_optional", required: false, label: CONSENT_LABELS_PT.whatsapp_optional },
];

const ATTENTION_VALUES = new Set(["sim", "prefiro_detalhar", "yes", "prefer_detail", "as_vezes"]);

export type IntakeStepId =
  | "welcome"
  | "identificacao"
  | "anamnese"
  | "consentimentos"
  | "revisao"
  | "enviado";

export const INTAKE_STEPS: Array<{ id: IntakeStepId; label: string }> = [
  { id: "identificacao", label: "Identificação" },
  { id: "anamnese", label: "Anamnese" },
  { id: "consentimentos", label: "Consentimentos" },
  { id: "revisao", label: "Revisão" },
];

export function schemaSections(schema: AnamnesisSchema | null | undefined): AnamnesisSection[] {
  return schema?.sections ?? [];
}

export function anamnesisQuestionSections(
  schema: AnamnesisSchema | null | undefined,
): AnamnesisSection[] {
  return schemaSections(schema).filter(
    (section) => (section.questions?.length ?? 0) > 0,
  );
}

export function consentsFromSchema(
  schema: AnamnesisSchema | null | undefined,
): AnamnesisConsentDef[] {
  for (const section of schemaSections(schema)) {
    if (section.consents?.length) return section.consents;
  }
  return GENERIC_FALLBACK_CONSENTS;
}

export function flattenQuestions(
  schema: AnamnesisSchema | null | undefined,
): AnamnesisQuestion[] {
  return anamnesisQuestionSections(schema).flatMap((section) => section.questions ?? []);
}

function answerValues(raw: unknown): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.map((v) => String(v).trim().toLowerCase()).filter(Boolean);
  if (typeof raw === "object") {
    const obj = raw as { value?: unknown };
    return answerValues(obj.value);
  }
  const s = String(raw).trim().toLowerCase();
  return s ? [s] : [];
}

export function isQuestionVisible(
  question: AnamnesisQuestion,
  answers: Record<string, unknown>,
): boolean {
  const rule = question.visible_if;
  if (!rule?.question_id || !rule.in?.length) return true;
  const current = answerValues(answers[rule.question_id]);
  const wanted = rule.in.map((v) => v.toLowerCase());
  return current.some((v) => wanted.includes(v));
}

export function flattenVisibleQuestions(
  schema: AnamnesisSchema | null | undefined,
  answers: Record<string, unknown>,
): AnamnesisQuestion[] {
  return flattenQuestions(schema).filter((q) => isQuestionVisible(q, answers));
}

function normalizeAnswerValue(raw: unknown): string {
  return answerValues(raw)[0] ?? "";
}

/** True when any attention-marked question has a yes/detail answer. */
export function hasAttentionAnswers(
  answers: Record<string, unknown>,
  schema: AnamnesisSchema | null | undefined,
): boolean {
  const byId = new Map(flattenQuestions(schema).map((q) => [q.id, q]));
  for (const [qid, raw] of Object.entries(answers)) {
    const meta = byId.get(qid);
    if (!meta?.attention) continue;
    if (ATTENTION_VALUES.has(normalizeAnswerValue(raw))) return true;
  }
  return false;
}

export function intakeSteps(formName?: string | null): Array<{ id: IntakeStepId; label: string }> {
  const formLabel = (formName || "").trim();
  const stepLabel =
    /anamnese/i.test(formLabel) ? "Anamnese" : formLabel ? "Formulário" : "Cadastro";
  return INTAKE_STEPS.map((step) =>
    step.id === "anamnese" ? { ...step, label: stepLabel } : step,
  );
}

export function requiredConsentsAccepted(
  consents: Record<string, boolean>,
  schema?: AnamnesisSchema | null,
): boolean {
  const defs = consentsFromSchema(schema);
  const required = defs.filter((c) => c.required).map((c) => c.key);
  if (!required.length) {
    return REQUIRED_CONSENT_KEYS.every((key) => consents[key] === true);
  }
  return required.every((key) => consents[key] === true);
}

export function missingRequiredQuestions(
  answers: Record<string, unknown>,
  schema: AnamnesisSchema | null | undefined,
): string[] {
  return flattenQuestions(schema)
    .filter((q) => q.required)
    .filter((q) => isQuestionVisible(q, answers))
    .filter((q) => {
      const raw = answers[q.id];
      if (raw == null) return true;
      if (typeof raw === "string") return !raw.trim();
      if (Array.isArray(raw)) return raw.length === 0;
      if (typeof raw === "object") {
        const obj = raw as { value?: unknown };
        if (obj.value == null || obj.value === "") return true;
        return false;
      }
      return false;
    })
    .map((q) => q.id);
}

export function ageProofValid(opts: {
  birthDate?: string | null;
  ageBand18Plus?: boolean;
}): boolean {
  if (opts.ageBand18Plus) return true;
  if (!opts.birthDate?.trim()) return false;
  const [y, m, d] = opts.birthDate.split("-").map(Number);
  if (!y || !m || !d) return false;
  const birth = new Date(y, m - 1, d);
  if (Number.isNaN(birth.getTime())) return false;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age >= 18;
}

export function submissionStatusLabel(status: string): string {
  switch (status) {
    case "pending_review":
      return "Aguardando análise";
    case "approved":
      return "Aprovado";
    case "rejected":
      return "Recusado";
    case "changes_requested":
      return "Ajustes solicitados";
    default:
      return status;
  }
}

export const EVALUATION_DECISION_OPTIONS = [
  { value: "needed", label: "Avaliação necessária" },
  { value: "waived", label: "Dispensar avaliação" },
  { value: "external", label: "Avaliação externa" },
  { value: "completed", label: "Avaliação concluída" },
] as const;

export const PROTOCOL_DECISION_OPTIONS = [
  { value: "needed", label: "Protocolo necessário" },
  { value: "waived", label: "Dispensar protocolo" },
  { value: "published", label: "Protocolo publicado" },
] as const;
