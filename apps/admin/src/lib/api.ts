export type ApiError = {
  code: string;
  message: string;
};

export type PlatformMe = {
  id: string;
  email: string;
  full_name: string;
  role: string;
};

export type OverviewMetrics = {
  organizations_total: number;
  professionals_total: number;
  registrations_last_7_days: number;
  organizations_active: number;
  organizations_evaluating: number;
  organizations_suspended: number;
  clients_active_total: number;
  appointments_scheduled_total?: number;
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
  clients_count: number;
  cycles_count: number;
};

export type OrganizationDetail = OrganizationListItem & {
  owner_email?: string | null;
  timezone?: string;
  appointments_count?: number;
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

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8010";

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
  const response = await fetch(`${API_URL}${path}`, {
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
