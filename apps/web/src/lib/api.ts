export type ApiError = {
  code: string;
  message: string;
  details?: unknown;
};

export type MeResponse = {
  user: {
    id: string;
    email: string;
    full_name: string;
    created_at: string;
  };
  organization: {
    id: string;
    name: string;
    timezone?: string;
  };
  role: string;
};

export type Client = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type Service = {
  id: string;
  name: string;
  description: string | null;
  default_duration_days: number;
  default_price_cents: number | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type Cycle = {
  id: string;
  client_id: string;
  service_id: string;
  cycle_type: string;
  status: string;
  starts_on: string;
  ends_on: string;
  value_cents: number | null;
  notes: string | null;
  last_contacted_at: string | null;
  contact_confirmed_at: string | null;
  created_at: string;
  updated_at: string;
  client_name: string | null;
  service_name: string | null;
  days_remaining: number | null;
  is_nearing_end: boolean;
};

export type Receivable = {
  id: string;
  cycle_id: string;
  client_id: string;
  amount_cents: number;
  due_on: string;
  status: string;
  paid_at: string | null;
  payment_method: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  client_name: string | null;
  cycle_service_name: string | null;
};

export type PriorityAction = {
  kind: string;
  title: string;
  subtitle: string;
  href: string;
  entity_id: string;
};

export type Location = {
  id: string;
  name: string;
  address: string | null;
  address_detail: string | null;
  map_url: string | null;
  meeting_url: string | null;
  notes: string | null;
  status: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Appointment = {
  id: string;
  client_id: string;
  cycle_id: string | null;
  service_id: string | null;
  location_id: string | null;
  title: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  client_name: string | null;
  service_name: string | null;
  location_name: string | null;
  cycle_service_name: string | null;
};

export type DayAgenda = {
  date: string;
  timezone: string;
  appointments: Appointment[];
  conflict_count: number;
};

export type OrgPreferences = {
  id: string;
  name: string;
  timezone: string;
  local_today: string;
};

export type WhatsAppPrep = {
  cycle_id: string;
  client_id: string;
  client_name: string;
  phone: string | null;
  message: string;
  wa_url: string | null;
  can_open_whatsapp: boolean;
};

export type HomeSummary = {
  organization_id: string;
  timezone: string;
  local_today: string;
  today_appointments: Appointment[];
  cycles_nearing_end: Cycle[];
  renewals: Cycle[];
  pending_payments: Receivable[];
  priority_action: PriorityAction | null;
  contextual_hint: string | null;
  message: string;
};

const SERVER_API_URL = (
  process.env.API_PROXY_TARGET?.trim() ||
  process.env.NEXT_PUBLIC_API_URL?.trim() ||
  "http://127.0.0.1:8010"
).replace(/\/$/, "");

/**
 * Browser always uses same-origin `/api` (Next rewrite → backend).
 * That avoids CORS and lets phones on LAN hit only the web host.
 */
export function getApiBaseUrl() {
  if (typeof window !== "undefined") {
    return "";
  }
  return SERVER_API_URL;
}

async function parseError(response: Response): Promise<ApiError> {
  try {
    const data = (await response.json()) as ApiError;
    if (data?.code && data?.message) return data;
  } catch {
    // fall through
  }
  return { code: "unknown_error", message: "Não foi possível concluir a solicitação." };
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<{ data?: T; error?: ApiError; status: number }> {
  try {
    const response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
    });

    if (response.status === 204) {
      return { status: response.status };
    }

    if (!response.ok) {
      return { error: await parseError(response), status: response.status };
    }

    const data = (await response.json()) as T;
    return { data, status: response.status };
  } catch {
    return {
      error: {
        code: "network_error",
        message: "Sem conexão com o servidor. Verifique a rede e tente de novo.",
      },
      status: 0,
    };
  }
}

export function formatBRL(cents: number | null | undefined) {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function reaisToCents(value: string) {
  const normalized = value.replace(",", ".").trim();
  const parsed = Number.parseFloat(normalized);
  if (Number.isNaN(parsed)) return null;
  return Math.round(parsed * 100);
}

/** Format an ISO instant in an IANA timezone for display. */
export function formatOrgDateTime(iso: string, timeZone: string, opts?: Intl.DateTimeFormatOptions) {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      ...opts,
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString("pt-BR");
  }
}

/** Convert datetime-local value to ISO with the browser's current offset. */
export function localInputToIso(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function isoToLocalInput(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function appointmentStatusLabel(status: string) {
  switch (status) {
    case "scheduled":
      return "Agendado";
    case "completed":
      return "Realizado";
    case "no_show":
      return "Falta do cliente";
    case "cancelled":
      return "Cancelado";
    default:
      return status;
  }
}
