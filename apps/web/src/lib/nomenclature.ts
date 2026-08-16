/** Central adaptive nomenclature — UI labels only (API enums unchanged). */

export type NomenclatureKey =
  | "client"
  | "clients"
  | "plan"
  | "plan_short"
  | "plan_review"
  | "session"
  | "evaluation"
  | "cycle"
  | "agenda"
  | "routine"
  | "accompaniment"
  | "new_intake"
  | "intake_form"
  | "plan_ending"
  | "feedback";

export type Nomenclature = Record<NomenclatureKey, string>;

const GENERIC: Nomenclature = {
  client: "cliente",
  clients: "clientes",
  plan: "plano de acompanhamento",
  plan_short: "plano",
  plan_review: "revisão do plano",
  session: "atendimento",
  evaluation: "avaliação",
  cycle: "ciclo",
  agenda: "agenda",
  routine: "rotina",
  accompaniment: "acompanhamento",
  new_intake: "Novos clientes",
  intake_form: "cadastro",
  plan_ending: "Preparar próximo plano",
  feedback: "Acompanhamento",
};

const BY_PROFESSION: Record<string, Nomenclature> = {
  personal_trainer: {
    client: "aluno",
    clients: "alunos",
    plan: "plano de acompanhamento",
    plan_short: "plano",
    plan_review: "revisão do plano",
    session: "treino",
    evaluation: "avaliação",
    cycle: "ciclo",
    agenda: "agenda",
    routine: "rotina",
    accompaniment: "acompanhamento",
    new_intake: "Novos alunos",
    intake_form: "anamnese",
    plan_ending: "Preparar novo planejamento",
    feedback: "Feedback",
  },
  private_tutor: {
    client: "aluno",
    clients: "alunos",
    plan: "plano de aprendizagem",
    plan_short: "plano",
    plan_review: "revisão do plano",
    session: "aula",
    evaluation: "avaliação",
    cycle: "ciclo",
    agenda: "agenda",
    routine: "rotina",
    accompaniment: "acompanhamento",
    new_intake: "Novos alunos",
    intake_form: "cadastro inicial",
    plan_ending: "Preparar próxima etapa",
    feedback: "Acompanhamento do aluno",
  },
  sports_teacher: {
    client: "aluno",
    clients: "alunos",
    plan: "plano de aprendizagem",
    plan_short: "plano",
    plan_review: "revisão do plano",
    session: "aula",
    evaluation: "avaliação",
    cycle: "ciclo",
    agenda: "agenda",
    routine: "rotina",
    accompaniment: "acompanhamento",
    new_intake: "Novos alunos",
    intake_form: "cadastro inicial",
    plan_ending: "Preparar nova etapa",
    feedback: "Feedback",
  },
  nutritionist: {
    client: "cliente",
    clients: "clientes",
    plan: "plano de acompanhamento",
    plan_short: "plano",
    plan_review: "revisão do plano",
    session: "consulta",
    evaluation: "evolução",
    cycle: "ciclo",
    agenda: "agenda",
    routine: "rotina",
    accompaniment: "acompanhamento",
    new_intake: "Novos clientes",
    intake_form: "ficha nutricional",
    plan_ending: "Preparar próximo plano",
    feedback: "Retorno",
  },
  physiotherapist: {
    client: "cliente",
    clients: "clientes",
    plan: "plano de cuidado/acompanhamento",
    plan_short: "plano",
    plan_review: "revisão do plano",
    session: "sessão",
    evaluation: "avaliação",
    cycle: "ciclo",
    agenda: "agenda",
    routine: "rotina",
    accompaniment: "acompanhamento",
    new_intake: "Novos clientes",
    intake_form: "ficha inicial",
    plan_ending: "Preparar próximo plano",
    feedback: "Acompanhamento",
  },
  consultant: {
    client: "cliente",
    clients: "clientes",
    plan: "plano de ação",
    plan_short: "plano",
    plan_review: "revisão do plano",
    session: "atendimento",
    evaluation: "avaliação",
    cycle: "ciclo",
    agenda: "agenda",
    routine: "rotina",
    accompaniment: "acompanhamento",
    new_intake: "Novos clientes",
    intake_form: "cadastro",
    plan_ending: "Preparar novo planejamento",
    feedback: "Follow-up",
  },
  coach_mentor: {
    client: "cliente",
    clients: "clientes",
    plan: "plano de ação",
    plan_short: "plano",
    plan_review: "revisão do plano",
    session: "sessão",
    evaluation: "avaliação",
    cycle: "ciclo",
    agenda: "agenda",
    routine: "rotina",
    accompaniment: "acompanhamento",
    new_intake: "Novos clientes",
    intake_form: "cadastro",
    plan_ending: "Preparar novo planejamento",
    feedback: "Acompanhamento",
  },
  aesthetics: {
    client: "cliente",
    clients: "clientes",
    plan: "plano de acompanhamento",
    plan_short: "plano",
    plan_review: "revisão do plano",
    session: "sessão",
    evaluation: "avaliação",
    cycle: "ciclo",
    agenda: "agenda",
    routine: "rotina",
    accompaniment: "acompanhamento",
    new_intake: "Novos clientes",
    intake_form: "ficha de atendimento",
    plan_ending: "Preparar próximo plano",
    feedback: "Retorno",
  },
};

const CODE_ALIASES: Record<string, string> = {
  private_teacher: "private_tutor",
  sports_instructor: "sports_teacher",
  beauty_professional: "aesthetics",
  other_self_employed: "other",
  generic_professional: "generic",
};

export function canonicalProfessionCode(code: string | null | undefined): string | null {
  if (!code) return null;
  return CODE_ALIASES[code] ?? code;
}

export function nomenclatureFor(professionCode: string | null | undefined): Nomenclature {
  const code = canonicalProfessionCode(professionCode);
  if (!code || code === "generic") return GENERIC;
  return BY_PROFESSION[code] ?? GENERIC;
}

export function t(terms: Nomenclature, key: NomenclatureKey): string {
  return terms[key] ?? GENERIC[key];
}

export function displayTerm(term: string): string {
  const value = (term || "").trim();
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function recommendedFormKind(
  professionCode: string | null | undefined,
  _specialty?: string | null,
): string {
  const code = canonicalProfessionCode(professionCode);
  if (code === "personal_trainer") return "physical_anamnesis";
  if (code === "private_tutor" || code === "sports_teacher") return "class_questionnaire";
  if (code === "aesthetics") return "aesthetics_intake";
  if (code === "physiotherapist") return "physio_intake";
  if (code === "nutritionist") return "nutrition_intake";
  return "simple_registration";
}

export const FORM_KIND_LABELS: Record<string, string> = {
  simple_registration: "Cadastro simples",
  physical_anamnesis: "Cadastro + anamnese de atividade física",
  class_questionnaire: "Cadastro + questionário de aulas",
  sports_questionnaire: "Cadastro + questionário esportivo",
  consulting_brief: "Cadastro + briefing",
  aesthetics_intake: "Ficha inicial de atendimento",
  physio_intake: "Ficha inicial de fisioterapia",
  nutrition_intake: "Ficha inicial de acompanhamento nutricional",
  custom: "Formulário personalizado",
};

export function recommendedFormLabel(
  professionCode: string | null | undefined,
  specialty?: string | null,
): string {
  return FORM_KIND_LABELS[recommendedFormKind(professionCode, specialty)] ?? "Cadastro simples";
}

export function registerSummaryLines(professionCode: string | null | undefined): string[] {
  const code = canonicalProfessionCode(professionCode);
  if (code === "personal_trainer") {
    return ["organizar alunos", "acompanhar treinos", "revisar planos", "controlar ciclos e agenda"];
  }
  if (code === "private_tutor" || code === "sports_teacher") {
    return ["organizar alunos", "planejar aulas", "acompanhar evolução", "controlar agenda e períodos"];
  }
  if (code === "consultant" || code === "coach_mentor") {
    return ["organizar clientes", "planejar acompanhamentos", "registrar follow-ups", "controlar agenda e ciclos"];
  }
  return ["organizar clientes", "planejar acompanhamentos", "registrar evoluções", "controlar agenda e ciclos"];
}

export const PROFESSION_OPTIONS = [
  { code: "personal_trainer", label: "Personal trainer" },
  { code: "private_tutor", label: "Professor particular" },
  { code: "sports_teacher", label: "Professor de esportes" },
  { code: "physiotherapist", label: "Fisioterapeuta" },
  { code: "nutritionist", label: "Nutricionista" },
  { code: "therapist", label: "Terapeuta" },
  { code: "consultant", label: "Consultor" },
  { code: "coach_mentor", label: "Coach ou mentor" },
  { code: "aesthetics", label: "Profissional de estética" },
  { code: "other", label: "Outro profissional autônomo" },
] as const;

/** Cadastro novo: lista curta. Códigos antigos permanecem válidos. */
export const REGISTER_PROFESSION_OPTIONS = [
  { code: "personal_trainer", label: "Personal trainer" },
  { code: "private_tutor", label: "Professor ou instrutor" },
  { code: "aesthetics", label: "Profissional de estética" },
  { code: "physiotherapist", label: "Fisioterapeuta" },
  { code: "nutritionist", label: "Nutricionista" },
  { code: "other", label: "Outro profissional" },
] as const;

export const USE_CASE_OPTIONS = [
  { code: "appointments_agenda", label: "Atendimentos e agenda" },
  { code: "classes", label: "Aulas" },
  { code: "workouts", label: "Treinos" },
  { code: "evaluations", label: "Avaliações" },
  { code: "plans_cycles", label: "Planos ou ciclos" },
  { code: "protocols", label: "Protocolos" },
  { code: "periodic_feedback", label: "Feedbacks periódicos" },
  { code: "consulting", label: "Consultorias" },
  { code: "other", label: "Outro" },
] as const;

export const SPORTS_SPECIALTIES = [
  { code: "musculacao", label: "Musculação" },
  { code: "corrida", label: "Corrida" },
  { code: "natacao", label: "Natação" },
  { code: "futebol", label: "Futebol" },
  { code: "luta", label: "Luta" },
  { code: "danca", label: "Dança" },
  { code: "pilates", label: "Pilates" },
  { code: "funcional", label: "Funcional" },
  { code: "other", label: "Outro" },
] as const;

export const TUTOR_SPECIALTIES = [
  { code: "idiomas", label: "Idiomas" },
  { code: "reforco_escolar", label: "Reforço escolar" },
  { code: "musica", label: "Música" },
  { code: "tecnologia", label: "Tecnologia" },
  { code: "provas", label: "Preparação para provas" },
  { code: "other", label: "Outro" },
] as const;

export function safeReturnTo(candidate: string | null | undefined): string | null {
  if (!candidate) return null;
  if (!candidate.startsWith("/app/")) return null;
  if (candidate.startsWith("//")) return null;
  if (candidate.includes("://")) return null;
  return candidate;
}
