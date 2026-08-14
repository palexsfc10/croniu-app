export type ApiError = {
  code: string;
  message: string;
};

export type PlatformMe = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  environment: string;
};

export type OverviewMetrics = {
  organizations_total: number;
  professionals_total: number;
  registrations_last_24_hours?: number;
  registrations_last_7_days: number;
  organizations_active: number;
  organizations_evaluating: number;
  organizations_suspended: number;
  organizations_in_trial?: number;
  trials_ending_soon?: number;
  subscriptions_active?: number;
  subscriptions_past_due_or_expired?: number;
  subscriptions_suspended_or_blocked?: number;
  clients_active_total: number;
  cycles_total?: number;
  appointments_scheduled_total?: number;
  receivables_total?: number;
  assistant_threads_total?: number;
  ai_proposals_generated?: number;
  ai_proposals_confirmed?: number;
  ai_failures_recent?: number;
  feedbacks_new?: number;
  errors_recent?: number;
  cycle_agenda_critical?: number;
  cycle_agenda_divergent?: number;
  environment?: string;
  generated_at: string;
};

export type OrganizationListItem = {
  id: string;
  name: string;
  status: string;
  plan_code: string;
  owner_name: string | null;
  owner_email_masked: string | null;
  created_at: string;
  last_activity_at: string | null;
  last_login_at?: string | null;
  clients_count: number;
  cycles_count: number;
  appointments_count?: number;
  assistant_threads_count?: number;
  subscription_status?: string | null;
  operational_status?: string | null;
};

export type OrganizationDetail = OrganizationListItem & {
  owner_email?: string | null;
  timezone?: string;
  appointments_count?: number;
  profession_label?: string | null;
  plans_count?: number;
  published_plans_count?: number;
  overdue_occurrences_count?: number;
};

export type UserListItem = {
  id: string;
  full_name: string;
  email_masked: string;
  account_status: string;
  email_verified: boolean;
  created_at: string;
  last_login_at: string | null;
  organization_id: string | null;
  organization_name: string | null;
  organization_role: string | null;
  platform_roles: string[];
};

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  page_size: number;
};

const SERVER_API_URL = (
  process.env.API_PROXY_TARGET?.trim() ||
  process.env.NEXT_PUBLIC_API_URL?.trim() ||
  "http://127.0.0.1:8010"
).replace(/\/$/, "");

/**
 * Browser always uses same-origin `/api` (Next rewrite → backend).
 * Admin cookie remains `croniu_admin_session` and is same-origin with this host.
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
    // ignore
  }
  return { code: "unknown_error", message: "Não foi possível concluir a solicitação." };
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<{ data?: T; error?: ApiError; status: number }> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    return { error: await parseError(response), status: response.status };
  }

  return { data: (await response.json()) as T, status: response.status };
}
