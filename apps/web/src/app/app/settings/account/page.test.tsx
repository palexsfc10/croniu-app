import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let me: {
  user: {
    full_name: string;
    email: string;
    contact_whatsapp_e164: string | null;
    whatsapp_marketing_consent_at: string | null;
  };
  organization: { name: string };
  role: string;
};

const refresh = vi.fn(async () => {});

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ me, refresh }),
}));

const patchCalls: Array<Record<string, unknown>> = [];

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    apiFetch: vi.fn(async (path: string, init?: RequestInit) => {
      if (path === "/api/v1/users/me/whatsapp-consent" && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        patchCalls.push(body);
        return {
          data: {
            contact_whatsapp_e164: body.contact_whatsapp_e164 === "" ? null : "5511999990000",
            whatsapp_marketing_consent_at: body.consent_granted === true ? "2026-09-03T00:00:00Z" : null,
          },
          status: 200,
        };
      }
      return { data: null, status: 404 };
    }),
  };
});

import AccountPage from "@/app/app/settings/account/page";

describe("Minha conta — editar WhatsApp e revogar consentimento", () => {
  beforeEach(() => {
    patchCalls.length = 0;
    refresh.mockClear();
    me = {
      user: {
        full_name: "Ana Silva",
        email: "ana@example.com",
        contact_whatsapp_e164: null,
        whatsapp_marketing_consent_at: null,
      },
      organization: { name: "Studio Ana" },
      role: "owner",
    };
  });

  afterEach(() => cleanup());

  it("shows the WhatsApp section with an unchecked consent checkbox by default", () => {
    render(<AccountPage />);
    expect(screen.getByText("Seu WhatsApp")).toBeInTheDocument();
    // Two checkboxes on the page now (WhatsApp consent + local assistant
    // preference) — the consent one renders first.
    expect(screen.getAllByRole("checkbox")[0]).not.toBeChecked();
    expect(screen.getByText(/Sem consentimento ativo hoje/)).toBeInTheDocument();
  });

  it("saves a new number without granting consent when the checkbox stays unchecked", async () => {
    render(<AccountPage />);
    fireEvent.change(screen.getByLabelText("Número"), { target: { value: "11999990000" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(patchCalls).toHaveLength(1));
    expect(patchCalls[0]).toMatchObject({
      contact_whatsapp_e164: "11999990000",
      consent_granted: false,
    });
  });

  it("grants consent only when the checkbox is explicitly checked before saving", async () => {
    render(<AccountPage />);
    fireEvent.change(screen.getByLabelText("Número"), { target: { value: "11999990000" } });
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(patchCalls).toHaveLength(1));
    expect(patchCalls[0]).toMatchObject({
      contact_whatsapp_e164: "11999990000",
      consent_granted: true,
    });
  });

  it("shows an explicit 'Revogar consentimento' action once consent is active, and it never touches the saved number", async () => {
    me.user.contact_whatsapp_e164 = "5511999990000";
    me.user.whatsapp_marketing_consent_at = "2026-09-01T00:00:00Z";
    render(<AccountPage />);
    expect(screen.getByText(/Consentimento ativo desde/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Revogar consentimento" }));
    await waitFor(() => expect(patchCalls).toHaveLength(1));
    expect(patchCalls[0]).toEqual({ consent_granted: false });
    expect(refresh).toHaveBeenCalled();
    await screen.findByText(/Consentimento revogado/);
  });

  it("offers 'Remover número' only when a number is already saved, and it clears both number and consent", async () => {
    render(<AccountPage />);
    expect(screen.queryByRole("button", { name: "Remover número" })).not.toBeInTheDocument();
    cleanup();

    me.user.contact_whatsapp_e164 = "5511999990000";
    me.user.whatsapp_marketing_consent_at = "2026-09-01T00:00:00Z";
    render(<AccountPage />);
    fireEvent.click(screen.getByRole("button", { name: "Remover número" }));
    await waitFor(() => expect(patchCalls).toHaveLength(1));
    expect(patchCalls[0]).toEqual({ contact_whatsapp_e164: "" });
  });

  it("never pre-checks consent just because a number is already saved without an active consent timestamp", () => {
    me.user.contact_whatsapp_e164 = "5511999990000";
    me.user.whatsapp_marketing_consent_at = null;
    render(<AccountPage />);
    expect(screen.getAllByRole("checkbox")[0]).not.toBeChecked();
    expect(screen.getByText(/Sem consentimento ativo hoje/)).toBeInTheDocument();
  });
});
