export type AgentStatus = {
  enabled: boolean;
  provider: string;
  model: string;
  tools: string[];
  entitlement_ok?: boolean;
  prompt_version?: string;
  voice_enabled?: boolean;
  voice?: {
    max_seconds: number;
    max_bytes: number;
    allowed_mime_types: string[];
  };
};

export type PendingAction = {
  id: string;
  thread_id?: string | null;
  tool_name: string;
  risk_class?: string;
  summary: string;
  summary_fields?: Record<string, unknown> | null;
  arguments: Record<string, unknown>;
  expires_at: string;
  status?: string;
  result?: Record<string, unknown> | null;
  error_code?: string | null;
};

export type ActionUiStatus =
  | "pending"
  | "executing"
  | "executed"
  | "cancelled"
  | "expired"
  | "failed";

export type ChatMessage = {
  id?: string;
  role: "user" | "assistant" | "system";
  content: string;
  pending?: PendingAction | null;
  actionStatus?: ActionUiStatus;
  statusLabel?: string;
  createdAt?: string;
};

export type Thread = {
  id: string;
  title: string | null;
  status: string;
  updated_at: string;
};

export type AgentChatResponse = {
  reply: string;
  status: string;
  thread_id?: string | null;
  pending_action?: PendingAction | null;
  tool_trace?: string[];
  usage?: Record<string, unknown>;
  action_status?: string | null;
  result?: Record<string, unknown> | null;
  idempotent_replay?: boolean;
};

export type VoicePhase =
  | "idle"
  | "requesting_permission"
  | "recording"
  | "stopping"
  | "uploading"
  | "transcribing"
  | "ready"
  | "cancelled"
  | "error";

export const SUGGESTIONS = [
  "Como está meu dia?",
  "Quem precisa de atenção?",
  "Quais ciclos estão terminando?",
  "Criar um compromisso",
];

export function riskLabel(risk?: string) {
  if (risk === "write_sensitive") return "Ação sensível";
  if (risk === "write_common") return "Escrita";
  return "Confirmação";
}

export function actionHeadline(status: ActionUiStatus, risk?: string) {
  if (status === "executing") return "Concluindo…";
  if (status === "executed") return "Ação concluída";
  if (status === "cancelled") return "Cancelada";
  if (status === "expired") return "Proposta expirada";
  if (status === "failed") return "Não foi possível concluir";
  return "Aguardando sua confirmação";
}

export function proposalTitle(toolName: string, summary: string) {
  const map: Record<string, string> = {
    propose_create_appointment: "Novo compromisso",
    propose_create_client: "Novo cliente",
    propose_create_cycle: "Novo ciclo",
    propose_update_appointment: "Atualizar compromisso",
    propose_cancel_appointment: "Cancelar compromisso",
  };
  return map[toolName] || summary.split("·")[0]?.trim() || "Proposta de ação";
}
