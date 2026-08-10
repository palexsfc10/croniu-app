import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminLoginForm } from "@/components/auth/admin-login-form";
import { Button } from "@/components/ui/button";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

describe("Admin UI", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders login button", () => {
    render(<Button>Entrar no admin</Button>);
    expect(screen.getByRole("button", { name: "Entrar no admin" })).toBeInTheDocument();
  });

  it("shows API denial message", async () => {
    const user = userEvent.setup();
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        code: "platform_forbidden",
        message: "Acesso administrativo negado.",
      }),
    } as Response);

    render(<AdminLoginForm />);
    await user.type(screen.getByLabelText("E-mail"), "a@b.com");
    await user.type(screen.getByLabelText("Senha"), "senha123456");
    await user.click(screen.getByRole("button", { name: "Entrar no admin" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Acesso administrativo negado.");
    });
  });
});
