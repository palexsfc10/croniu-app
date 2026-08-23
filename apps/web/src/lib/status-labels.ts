/** UI-only labels. Never render raw API enums. */

const JOURNEY_STAGE: Record<string, string> = {
  pending_registration: "Cadastro incompleto",
  pending_anamnesis: "Formulário pendente",
  pending_review: "Aguardando análise",
  approved: "Cadastro aprovado",
  evaluation_pending: "Avaliação pendente",
  protocol_pending: "Plano pendente",
  ready_to_start: "Pronto para iniciar",
  active: "Em acompanhamento",
  review_due: "Revisão necessária",
  paused: "Pausado",
  rejected: "Cadastro recusado",
  archived: "Arquivado",
};

const NEXT_ACTION: Record<string, string> = {
  review_submission: "Analisar cadastro",
  update_anamnesis: "Atualizar formulário",
  prepare_accompaniment: "Preparar acompanhamento",
  continue_onboarding: "Preparar acompanhamento",
  create_cycle: "Criar ciclo",
  organize_agenda: "Organizar agenda",
  review_plan: "Revisar plano",
  prepare_new_plan: "Preparar novo plano",
  send_feedback: "Enviar acompanhamento",
};

const PROTOCOL_STATUS: Record<string, string> = {
  draft: "Rascunho",
  published: "Publicado",
  archived: "Arquivado",
  superseded: "Substituído",
};

const CLIENT_STATUS: Record<string, string> = {
  active: "Ativo",
  archived: "Arquivado",
};

const TECHNICAL = /^(continue_onboarding|draft|published|ready_to_start|active|[a-z]+_[a-z_]+)$/;

export function labelOf(map: Record<string, string>, value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  return map[value] ?? fallback;
}

export function journeyStageLabel(stage: string | null | undefined): string {
  return labelOf(JOURNEY_STAGE, stage, "Em acompanhamento");
}

export function nextActionLabel(action: string | null | undefined): string | null {
  if (!action) return null;
  return labelOf(NEXT_ACTION, action, "Próximo passo");
}

export function protocolStatusLabel(status: string | null | undefined): string {
  return labelOf(PROTOCOL_STATUS, status, "Em elaboração");
}

export function clientStatusLabel(status: string | null | undefined): string {
  return labelOf(CLIENT_STATUS, status, "Ativo");
}

const CLIENT_STATUS_TONE: Record<string, "info" | "neutral" | "warning"> = {
  active: "info",
  archived: "neutral",
  pending_duplicate_review: "warning",
};

export function clientStatusTone(status: string | null | undefined): "info" | "neutral" | "warning" {
  return CLIENT_STATUS_TONE[status ?? "active"] ?? "info";
}

/** First letter of the first two words — "Ana Paula Souza" → "AP". Never
 * more than 2 characters, so it fits a small round avatar chip. */
export function initials(fullName: string | null | undefined): string {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function looksTechnical(value: string | null | undefined): boolean {
  if (!value) return false;
  return TECHNICAL.test(value);
}

export function formatPhoneBR(raw: string | null | undefined): string {
  const digits = (raw || "").replace(/\D/g, "");
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return raw?.trim() || "—";
}
