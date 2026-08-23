import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "@/components/auth/login-form";
import { RegisterForm } from "@/components/auth/register-form";

const replace = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Feature-flag gate lives in this module — force it "configured" for this
// file only, so we can exercise the button/callback wiring without a real
// NEXT_PUBLIC_GOOGLE_CLIENT_ID or a real Google Identity Services script.
vi.mock("@/lib/google-auth", () => ({
  GOOGLE_CLIENT_ID: "test-client-id.apps.googleusercontent.com",
  isGoogleAuthConfigured: true,
  loadGoogleIdentityScript: () => Promise.resolve(),
}));

type GoogleCallback = (response: { credential?: string }) => void;

function stubGoogleIdentityServices(): { getCallback: () => GoogleCallback } {
  let callback: GoogleCallback = () => undefined;
  (window as unknown as { google: unknown }).google = {
    accounts: {
      id: {
        initialize: (config: { callback: GoogleCallback }) => {
          callback = config.callback;
        },
        renderButton: () => undefined,
        cancel: () => undefined,
      },
    },
  };
  return { getCallback: () => callback };
}

describe("Google sign-in flow", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    delete (window as unknown as { google?: unknown }).google;
  });

  beforeEach(() => {
    replace.mockReset();
    refresh.mockReset();
  });

  it("renders the Google button and divider when configured", async () => {
    stubGoogleIdentityServices();
    render(<LoginForm />);
    await waitFor(() => {
      expect(screen.getByText("ou continue com seu e-mail")).toBeInTheDocument();
    });
  });

  it("logs in and redirects to /app on a successful Google credential", async () => {
    const { getCallback } = stubGoogleIdentityServices();
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/auth/me")) {
        return {
          ok: false,
          status: 401,
          json: async () => ({ code: "unauthenticated", message: "Não autenticado." }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          user: { id: "1", email: "a@example.com", full_name: "A", created_at: "" },
          organization: { id: "org-1", name: "Org" },
          role: "owner",
          is_new_user: false,
          onboarding_required: false,
          requires_email_verification: false,
        }),
      } as Response;
    });

    render(<LoginForm />);
    await waitFor(() => expect(screen.getByText("ou continue com seu e-mail")).toBeInTheDocument());

    getCallback()({ credential: "fake-id-token" });

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app"));
  });

  it("shows an inline password field when the account already exists (google_link_required)", async () => {
    const { getCallback } = stubGoogleIdentityServices();
    const user = userEvent.setup();
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/auth/me")) {
        return {
          ok: false,
          status: 401,
          json: async () => ({ code: "unauthenticated", message: "Não autenticado." }),
        } as Response;
      }
      if (url.includes("/auth/google/link")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            user: { id: "1", email: "a@example.com", full_name: "A", created_at: "" },
            organization: { id: "org-1", name: "Org" },
            role: "owner",
            is_new_user: false,
            onboarding_required: false,
            requires_email_verification: false,
          }),
        } as Response;
      }
      return {
        ok: false,
        status: 409,
        json: async () => ({
          code: "google_link_required",
          message: "Já existe uma conta com este e-mail. Entre com sua senha para conectar o Google.",
        }),
      } as Response;
    });

    render(<LoginForm />);
    await waitFor(() => expect(screen.getByText("ou continue com seu e-mail")).toBeInTheDocument());

    getCallback()({ credential: "fake-id-token" });

    const passwordField = await screen.findByLabelText("Confirme sua senha do Croniu");
    expect(passwordField).toBeInTheDocument();

    await user.type(passwordField, "SenhaAtual1!");
    await user.click(screen.getByRole("button", { name: "Conectar Google e entrar" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app"));
  });

  it("register form also renders the Google entry point", async () => {
    stubGoogleIdentityServices();
    render(<RegisterForm />);
    await waitFor(() => {
      expect(screen.getByText("ou continue com seu e-mail")).toBeInTheDocument();
    });
  });
});
