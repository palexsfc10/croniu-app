import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OrganizationDetail } from "@/lib/api";

vi.mock("next/navigation", () => ({
  useParams: () => ({ organizationId: "org-1" }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/components/auth/admin-auth-provider", () => ({
  useAdminAuth: () => ({ me: { environment: "hml" } }),
}));

const DETAIL: OrganizationDetail = {
  id: "org-1",
  name: "Studio Fit",
  status: "active",
  plan_code: "trial",
  owner_name: "Fernanda",
  owner_email_masked: "f***@ex.com",
  created_at: "2026-08-01T00:00:00Z",
  last_activity_at: null,
  last_login_at: null,
  clients_count: 3,
  cycles_count: 2,
  trial_ends_at: "2026-09-01T00:00:00Z",
  trial_ends_at_local: "2026-09-01T00:00:00Z",
};

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from "@/lib/api";
import OrganizationDetailPage from "./page";

function mockApi() {
  vi.mocked(apiFetch).mockImplementation(async (path: string) => {
    if (path.includes("/timeline")) {
      return { data: { organization_id: "org-1", organization_name: "Studio Fit", events: [] }, status: 200 };
    }
    if (path === "/api/v1/platform/organizations/org-1") {
      return { data: DETAIL, status: 200 };
    }
    if (path.includes("/deactivate")) {
      return { data: { ...DETAIL, status: "disabled" }, status: 200 };
    }
    return { data: null, status: 200 } as never;
  });
}

describe("OrganizationDetailPage — danger zone requires explicit confirmation", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("does not call the deactivate endpoint until the confirm dialog is accepted", async () => {
    mockApi();
    render(<OrganizationDetailPage />);

    await screen.findByRole("heading", { name: "Studio Fit" });

    const deactivateSection = screen.getByRole("heading", { name: "Desativar conta" }).closest("div")!;
    fireEvent.change(within(deactivateSection).getByLabelText(/Digite o nome da organização/i), {
      target: { value: "Studio Fit" },
    });
    fireEvent.change(within(deactivateSection).getByLabelText(/Motivo administrativo$/i), {
      target: { value: "Solicitação do cliente" },
    });
    fireEvent.click(within(deactivateSection).getByRole("button", { name: "Desativar conta" }));

    // Trigger only opens the confirmation dialog — no API call yet.
    expect(
      vi.mocked(apiFetch).mock.calls.some((c) => String(c[0]).includes("/deactivate")),
    ).toBe(false);
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(/perderá acesso imediatamente/i);

    fireEvent.click(screen.getByRole("button", { name: "Confirmar desativação" }));

    await waitFor(() => {
      expect(
        vi.mocked(apiFetch).mock.calls.some((c) => String(c[0]).includes("/deactivate")),
      ).toBe(true);
    });
  });
});
