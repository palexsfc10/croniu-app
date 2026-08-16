/** Profession-aware form copy. Screens call helpers — they must not branch on profession. */

import { canonicalProfessionCode } from "@/lib/nomenclature";

export type Chip = { label: string; value: string };

export type EvaluationGuidance = {
  titlePlaceholder: string;
  titleSuggestions: Chip[];
  summaryPlaceholder: string;
  summaryChips: Chip[];
  achievementsPlaceholder: string;
  attentionPlaceholder: string;
  nextStepsPlaceholder: string;
};

export type PlanGuidance = {
  title: string;
  titlePlaceholder: string;
  objectivePlaceholder: string;
  strategyPlaceholder: string;
  externalLinkHint: string;
};

const EVAL_FALLBACK: EvaluationGuidance = {
  titlePlaceholder: "Ex.: Avaliação mensal",
  titleSuggestions: [
    { label: "Avaliação mensal", value: "Avaliação mensal" },
    { label: "Revisão da etapa", value: "Revisão da etapa" },
  ],
  summaryPlaceholder: "Registre os principais avanços, dificuldades e próximos passos.",
  summaryChips: [
    { label: "Evoluiu bem", value: "Evoluiu bem. " },
    { label: "Precisa de atenção", value: "Precisa de atenção. " },
    { label: "Meta alcançada", value: "Meta alcançada. " },
    { label: "Ajustar estratégia", value: "Ajustar estratégia. " },
  ],
  achievementsPlaceholder: "Ex.: melhorou a frequência, atingiu uma meta ou concluiu uma etapa.",
  attentionPlaceholder: "Ex.: dificuldade de manter a rotina ou necessidade de adaptar o plano.",
  nextStepsPlaceholder: "Ex.: manter a frequência e revisar novamente em 30 dias.",
};

const EVAL_BY_CODE: Record<string, Partial<EvaluationGuidance>> = {
  personal_trainer: {
    titleSuggestions: [
      { label: "Avaliação inicial", value: "Avaliação inicial" },
      { label: "Evolução mensal", value: "Evolução mensal" },
      { label: "Revisão do ciclo", value: "Revisão do ciclo" },
    ],
  },
  nutritionist: {
    titlePlaceholder: "Ex.: Retorno mensal",
    titleSuggestions: [
      { label: "Retorno mensal", value: "Retorno mensal" },
      { label: "Evolução do acompanhamento", value: "Evolução do acompanhamento" },
    ],
  },
  private_tutor: {
    titleSuggestions: [
      { label: "Avaliação de progresso", value: "Avaliação de progresso" },
      { label: "Revisão do período", value: "Revisão do período" },
    ],
  },
  sports_teacher: {
    titleSuggestions: [
      { label: "Avaliação de progresso", value: "Avaliação de progresso" },
      { label: "Revisão do período", value: "Revisão do período" },
    ],
  },
  consultant: {
    titleSuggestions: [
      { label: "Revisão de resultados", value: "Revisão de resultados" },
      { label: "Avaliação da etapa", value: "Avaliação da etapa" },
    ],
  },
  coach_mentor: {
    titleSuggestions: [
      { label: "Revisão de resultados", value: "Revisão de resultados" },
      { label: "Avaliação da etapa", value: "Avaliação da etapa" },
    ],
  },
};

const PLAN_BY_CODE: Record<string, PlanGuidance> = {
  personal_trainer: {
    title: "Plano de acompanhamento",
    titlePlaceholder: "Ex.: Ganho de massa — ciclo inicial",
    objectivePlaceholder: "Ex.: ganhar consistência e evoluir gradualmente durante 12 semanas.",
    strategyPlaceholder:
      "Ex.: acompanhar frequência, revisar evolução mensalmente e ajustar quando necessário.",
    externalLinkHint: "Cole um link do seu aplicativo, documento ou material, se utilizar.",
  },
  sports_teacher: {
    title: "Estratégia do período",
    titlePlaceholder: "Ex.: Preparação do trimestre",
    objectivePlaceholder: "Ex.: evoluir técnica e consistência ao longo do período.",
    strategyPlaceholder: "Ex.: revisar mensalmente e ajustar a estratégia conforme a evolução.",
    externalLinkHint: "Cole um link do seu aplicativo, documento ou material, se utilizar.",
  },
  nutritionist: {
    title: "Plano de acompanhamento",
    titlePlaceholder: "Ex.: Recomposição — 12 semanas",
    objectivePlaceholder: "Ex.: construir rotina alimentar sustentável nas próximas 12 semanas.",
    strategyPlaceholder: "Ex.: retornos mensais e ajustes conforme adesão e evolução.",
    externalLinkHint: "Cole um link do seu aplicativo, documento ou material, se utilizar.",
  },
  private_tutor: {
    title: "Plano de ensino/acompanhamento",
    titlePlaceholder: "Ex.: Reforço de matemática — 2º bimestre",
    objectivePlaceholder: "Ex.: consolidar a base e ganhar autonomia nas tarefas.",
    strategyPlaceholder: "Ex.: revisar quinzenalmente e ajustar o ritmo conforme o progresso.",
    externalLinkHint: "Cole um link do material ou pasta compartilhada, se utilizar.",
  },
  consultant: {
    title: "Plano de ação",
    titlePlaceholder: "Ex.: Organização comercial — 90 dias",
    objectivePlaceholder: "Ex.: estruturar rotina e avançar nas metas do trimestre.",
    strategyPlaceholder: "Ex.: checkpoints mensais e ajustes conforme os resultados.",
    externalLinkHint: "Cole um link do documento ou quadro, se utilizar.",
  },
  coach_mentor: {
    title: "Plano de ação",
    titlePlaceholder: "Ex.: Foco em liderança — 8 semanas",
    objectivePlaceholder: "Ex.: desenvolver consistência e clareza na próxima etapa.",
    strategyPlaceholder: "Ex.: sessões quinzenais e revisão da estratégia ao fim do ciclo.",
    externalLinkHint: "Cole um link do documento ou quadro, se utilizar.",
  },
};

const PLAN_FALLBACK: PlanGuidance = {
  title: "Plano de acompanhamento",
  titlePlaceholder: "Ex.: Acompanhamento — ciclo inicial",
  objectivePlaceholder: "Ex.: ganhar consistência e evoluir gradualmente durante 12 semanas.",
  strategyPlaceholder:
    "Ex.: acompanhar frequência, revisar evolução mensalmente e ajustar quando necessário.",
  externalLinkHint: "Cole um link do seu aplicativo, documento ou material, se utilizar.",
};

export function evaluationGuidance(professionCode: string | null | undefined): EvaluationGuidance {
  const code = canonicalProfessionCode(professionCode) ?? "other";
  return { ...EVAL_FALLBACK, ...(EVAL_BY_CODE[code] ?? {}) };
}

export function planGuidance(professionCode: string | null | undefined): PlanGuidance {
  const code = canonicalProfessionCode(professionCode) ?? "other";
  return PLAN_BY_CODE[code] ?? PLAN_FALLBACK;
}

export const ROUTINE_NAME_SUGGESTIONS: Chip[] = [
  { label: "Revisar planos do mês", value: "Revisar planos do mês" },
  { label: "Pedir feedback", value: "Pedir feedback" },
  { label: "Preparar renovações", value: "Preparar renovações" },
  { label: "Avaliação mensal", value: "Avaliação mensal" },
  { label: "Contato de acompanhamento", value: "Contato de acompanhamento" },
];

export function routineTypes(hasWorkouts: boolean): { value: string; label: string }[] {
  const rows = [
    { value: "review_protocol", label: "Revisar plano" },
    { value: "send_feedback", label: "Solicitar/enviar feedback" },
    { value: "review_cycle", label: "Revisar ciclo" },
    { value: "prepare_renewal", label: "Preparar renovação" },
    { value: "review_evaluation", label: "Realizar avaliação" },
    { value: "contact_client", label: "Entrar em contato" },
    { value: "check_payment", label: "Conferir pagamento" },
    { value: "free", label: "Outro" },
  ];
  if (hasWorkouts) {
    return [{ value: "swap_training", label: "Revisar referência de treino (externa)" }, ...rows];
  }
  return rows;
}
