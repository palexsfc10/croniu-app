import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginForm } from "@/components/auth/login-form";

const apiFetch = vi.fn();
const replace = vi.fn();
const refresh = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    apiFetch: (...args: unknown[]) => apiFetch(...args),
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/lib/google-auth", () => ({ isGoogleAuthConfigured: true }));

vi.mock("@/components/auth/google-auth-button", () => ({
  GoogleAuthButton: ({ onCredential }: { onCredential: (credential: string) => void }) => (
    <button type="button" onClick={() => onCredential("google-credential-stub")}>
      Continuar com Google (stub)
    </button>
  ),
}));

describe("LoginForm — sign_up via Google (conta criada durante o login)", () => {
  afterEach(() => {
    cleanup();
    apiFetch.mockReset();
    replace.mockReset();
    refresh.mockReset();
    window.dataLayer = undefined;
  });

  it("fires sign_up (method=google) when the /login Google button creates a brand-new account", async () => {
    apiFetch.mockImplementation((path: string) => {
      if (path === "/api/v1/auth/me") {
        return Promise.resolve({ status: 401, error: { code: "unauthorized", message: "" } });
      }
      return Promise.resolve({
        status: 200,
        data: { is_new_user: true, onboarding_required: true, user: {}, organization: {}, role: "owner" },
      });
    });
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.click(await screen.findByRole("button", { name: "Continuar com Google (stub)" }));
    await waitFor(() => {
      expect(window.dataLayer).toContainEqual({ event: "sign_up", method: "google" });
    });
  }, 15_000);

  it("does not fire sign_up when the /login Google button logs into an existing account", async () => {
    apiFetch.mockImplementation((path: string) => {
      if (path === "/api/v1/auth/me") {
        return Promise.resolve({ status: 401, error: { code: "unauthorized", message: "" } });
      }
      return Promise.resolve({
        status: 200,
        data: { is_new_user: false, onboarding_required: false, user: {}, organization: {}, role: "owner" },
      });
    });
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.click(await screen.findByRole("button", { name: "Continuar com Google (stub)" }));
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/app");
    });
    expect(window.dataLayer ?? []).not.toContainEqual(
      expect.objectContaining({ event: "sign_up" }),
    );
  }, 15_000);
});
