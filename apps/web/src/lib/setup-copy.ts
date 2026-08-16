import { canonicalProfessionCode } from "@/lib/nomenclature";

export type SetupCopy = {
  cardTitle: string;
  cardDescription: string;
  serviceTitle: string;
  serviceHint: string;
  serviceExample: string;
  serviceNamePlaceholder: string;
  templateTitle: string;
  templateHint: string;
  templateExample: string;
  templateNamePlaceholder: string;
};

const GENERIC: SetupCopy = {
  cardTitle: "Prepare seu Croniu",
  cardDescription: "Configure sua forma de atendimento para criar ciclos com mais rapidez.",
  serviceTitle: "Crie seu primeiro serviço",
  serviceHint: "Informe o que você oferece, a duração e o valor.",
  serviceExample: "Ex.: atendimento de 1 hora com valor definido.",
  serviceNamePlaceholder: "Ex.: Atendimento",
  templateTitle: "Configure um modelo de ciclo",
  templateHint: "Defina uma frequência que você usa, como 2 vezes por semana.",
  templateExample: "Ex.: pacote mensal ou quantidade de atendimentos.",
  templateNamePlaceholder: "Ex.: Acompanhamento mensal",
};

const BY_PROFESSION: Record<string, Partial<SetupCopy>> = {
  personal_trainer: {
    cardTitle: "Prepare seus serviços e ciclos",
    serviceExample: "Ex.: aula individual de 1 hora por R$ 80.",
    serviceNamePlaceholder: "Ex.: Aula individual",
    templateExample: "Ex.: 2 aulas por semana — mensal.",
    templateNamePlaceholder: "Ex.: 2 vezes por semana — mensal",
  },
  private_tutor: {
    serviceExample: "Ex.: aula de inglês de 1 hora por R$ 70.",
    serviceNamePlaceholder: "Ex.: Aula de inglês",
    templateExample: "Ex.: 2 aulas por semana — mensal.",
    templateNamePlaceholder: "Ex.: 2 vezes por semana — mensal",
  },
  sports_teacher: {
    serviceExample: "Ex.: aula individual ou treino em grupo.",
    serviceNamePlaceholder: "Ex.: Aula individual",
    templateExample: "Ex.: 3 treinos por semana.",
    templateNamePlaceholder: "Ex.: 3 vezes por semana — mensal",
  },
  consultant: {
    serviceExample: "Ex.: sessão de consultoria de 1 hora.",
    serviceNamePlaceholder: "Ex.: Sessão de consultoria",
    templateExample: "Ex.: acompanhamento mensal com 4 encontros.",
    templateNamePlaceholder: "Ex.: Acompanhamento mensal",
  },
  coach_mentor: {
    serviceExample: "Ex.: sessão individual de acompanhamento.",
    serviceNamePlaceholder: "Ex.: Sessão individual",
    templateExample: "Ex.: 4 sessões durante o mês.",
    templateNamePlaceholder: "Ex.: 4 sessões no mês",
  },
  aesthetics: {
    serviceExample: "Ex.: sessão ou procedimento com duração e valor.",
    serviceNamePlaceholder: "Ex.: Sessão",
    templateExample: "Ex.: pacote de 4 sessões.",
    templateNamePlaceholder: "Ex.: Pacote de 4 sessões",
  },
};

export function setupCopyFor(professionCode: string | null | undefined): SetupCopy {
  const code = canonicalProfessionCode(professionCode) ?? "other";
  return { ...GENERIC, ...(BY_PROFESSION[code] ?? {}) };
}

export const SETUP_COLLAPSE_KEY = "croniu.initialSetup.collapsed";
export const SETUP_CELEBRATE_KEY = "croniu.initialSetup.celebrate";

const collapseListeners = new Set<() => void>();

export function subscribeInitialSetupCollapse(onStoreChange: () => void) {
  collapseListeners.add(onStoreChange);
  return () => {
    collapseListeners.delete(onStoreChange);
  };
}

export function getInitialSetupCollapsed(): boolean {
  try {
    return sessionStorage.getItem(SETUP_COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setInitialSetupCollapsed(collapsed: boolean) {
  try {
    if (collapsed) sessionStorage.setItem(SETUP_COLLAPSE_KEY, "1");
    else sessionStorage.removeItem(SETUP_COLLAPSE_KEY);
  } catch {
    /* ignore */
  }
  collapseListeners.forEach((cb) => cb());
}

export function encodeAppReturnTo(path: string): string {
  return encodeURIComponent(path);
}
