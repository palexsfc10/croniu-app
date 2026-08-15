import { describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach } from "vitest";
import { RegisterForm } from "@/components/auth/register-form";

const apiFetch = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    apiFetch: (...args: unknown[]) => apiFetch(...args),
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("RegisterForm", () => {
  afterEach(() => {
    cleanup();
    apiFetch.mockReset();
  });

  it("keeps step-1 values when submitting a profession on step 2", async () => {
    const user = userEvent.setup();
    apiFetch.mockResolvedValue({
      status: 201,
      data: { requires_email_verification: true, user: {}, organization: {}, role: "owner" },
    });
    render(<RegisterForm />);
    await user.type(screen.getByLabelText("Seu nome"), "Ana Silva");
    await user.type(screen.getByLabelText(/Nome do negócio/), "Studio Ana");
    await user.type(screen.getByLabelText("E-mail"), "ana@example.com");
    await user.type(screen.getByLabelText("Senha"), "SenhaForte1!");
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await screen.findByText("Qual é a sua área de atuação?");
    await user.click(screen.getByLabelText("Personal trainer"));
    await user.click(screen.getByRole("button", { name: "Criar minha conta" }));
    expect(apiFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(apiFetch.mock.calls[0][1].body as string) as {
      full_name: string;
      email: string;
      profession_code: string;
      password: string;
    };
    expect(body.full_name).toBe("Ana Silva");
    expect(body.email).toBe("ana@example.com");
    expect(body.profession_code).toBe("personal_trainer");
    expect(body.password).toBe("SenhaForte1!");
  }, 15_000);
});
