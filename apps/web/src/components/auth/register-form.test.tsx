import { describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach } from "vitest";
import { RegisterForm } from "@/components/auth/register-form";

const apiFetch = vi.fn();
const replace = vi.fn();
const refresh = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    apiFetch: (...args: unknown[]) => apiFetch(...args),
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
  useSearchParams: () => searchParams,
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Seu nome"), "Ana Silva");
  await user.type(screen.getByLabelText(/Nome do negócio/), "Studio Ana");
  await user.type(screen.getByLabelText("E-mail"), "ana@example.com");
  await user.type(screen.getByLabelText("Senha"), "SenhaForte1!");
  await user.click(screen.getByRole("button", { name: "Criar minha conta" }));
}

describe("RegisterForm — cadastro enxuto (etapa única, sem profissão)", () => {
  afterEach(() => {
    cleanup();
    apiFetch.mockReset();
    replace.mockReset();
    refresh.mockReset();
    searchParams = new URLSearchParams();
  });

  it("has no profession/use_cases fields on the register screen", () => {
    render(<RegisterForm />);
    expect(screen.queryByText(/área de atuação/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/o que fizer parte da sua rotina/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Seu nome")).toBeInTheDocument();
    expect(screen.getByLabelText(/Nome do negócio/)).toBeInTheDocument();
    expect(screen.getByLabelText("E-mail")).toBeInTheDocument();
    expect(screen.getByLabelText("Senha")).toBeInTheDocument();
  });

  it("submits only the minimal fields — no profession_code/use_cases in the payload", async () => {
    const user = userEvent.setup();
    apiFetch.mockResolvedValue({
      status: 201,
      data: {
        onboarding_required: true,
        user: {},
        organization: {},
        role: "owner",
      },
    });
    render(<RegisterForm />);
    await fillAndSubmit(user);

    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [path, init] = apiFetch.mock.calls[0] as [string, { body: string }];
    expect(path).toBe("/api/v1/auth/register");
    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect(body).toEqual({
      full_name: "Ana Silva",
      organization_name: "Studio Ana",
      email: "ana@example.com",
      password: "SenhaForte1!",
      referral_code: null,
    });
    expect(body).not.toHaveProperty("profession_code");
    expect(body).not.toHaveProperty("use_cases");
  }, 15_000);

  it("redirects a brand-new account (onboarding_required) to /app/onboarding", async () => {
    const user = userEvent.setup();
    apiFetch.mockResolvedValue({
      status: 201,
      data: { onboarding_required: true, user: {}, organization: {}, role: "owner" },
    });
    render(<RegisterForm />);
    await fillAndSubmit(user);
    expect(replace).toHaveBeenCalledWith("/app/onboarding");
  }, 15_000);

  it("redirects straight to /app when onboarding is already complete", async () => {
    const user = userEvent.setup();
    apiFetch.mockResolvedValue({
      status: 201,
      data: { onboarding_required: false, user: {}, organization: {}, role: "owner" },
    });
    render(<RegisterForm />);
    await fillAndSubmit(user);
    expect(replace).toHaveBeenCalledWith("/app");
  }, 15_000);

  it("forwards a safe ?next= into the onboarding redirect", async () => {
    searchParams = new URLSearchParams("next=/app/clients");
    const user = userEvent.setup();
    apiFetch.mockResolvedValue({
      status: 201,
      data: { onboarding_required: true, user: {}, organization: {}, role: "owner" },
    });
    render(<RegisterForm />);
    await fillAndSubmit(user);
    expect(replace).toHaveBeenCalledWith("/app/onboarding?next=%2Fapp%2Fclients");
  }, 15_000);

  it("ignores an off-site ?next= instead of redirecting there", async () => {
    searchParams = new URLSearchParams("next=https://evil.example.com");
    const user = userEvent.setup();
    apiFetch.mockResolvedValue({
      status: 201,
      data: { onboarding_required: false, user: {}, organization: {}, role: "owner" },
    });
    render(<RegisterForm />);
    await fillAndSubmit(user);
    expect(replace).toHaveBeenCalledWith("/app");
  }, 15_000);

  it("shows the pending-email screen and does not redirect when verification is required", async () => {
    const user = userEvent.setup();
    apiFetch.mockResolvedValue({
      status: 201,
      data: {
        requires_email_verification: true,
        onboarding_required: true,
        user: {},
        organization: {},
        role: "owner",
      },
    });
    render(<RegisterForm />);
    await fillAndSubmit(user);
    await screen.findByText(/Conta criada\. Enviamos um link para/);
    expect(replace).not.toHaveBeenCalled();
  }, 15_000);
});
