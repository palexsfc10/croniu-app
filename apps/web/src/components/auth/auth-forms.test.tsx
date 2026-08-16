import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { RegisterForm } from "@/components/auth/register-form";
import { LoginForm } from "@/components/auth/login-form";
import { VerifyEmailForm } from "@/components/auth/verify-email-form";

const replace = vi.fn();
const refresh = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
  useSearchParams: () => searchParams,
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("Auth forms", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    replace.mockReset();
    refresh.mockReset();
    searchParams = new URLSearchParams();
  });

  it("walks two steps before creating the account", async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);
    await user.type(screen.getByLabelText("Seu nome"), "Ana Consultora");
    await user.type(screen.getByLabelText(/Nome do negócio/i), "Studio Ana");
    await user.type(screen.getByLabelText("E-mail"), "ana@example.com");
    await user.type(screen.getByLabelText("Senha"), "senha12345");
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByText(/Etapa 2 de 2/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Entrar" })).toHaveAttribute("href", "/login");
    const fetchSpy = vi.spyOn(global, "fetch");
    await user.click(screen.getByRole("link", { name: "Entrar" }));
    expect(fetchSpy).not.toHaveBeenCalled();
    await user.click(screen.getByLabelText("Personal trainer"));
    expect(screen.getByText("Sua experiência")).toBeInTheDocument();
    await user.click(screen.getByLabelText("Nutricionista"));
    expect(screen.getByText("Sua experiência")).toBeInTheDocument();
    expect(screen.queryByText(/Seu Croniu será preparado para/)).not.toBeInTheDocument();
    expect(screen.queryByText(/anamnese de atividade física/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar minha conta" })).toBeInTheDocument();
  }, 15_000);

  it("opens login from registration step 1 without submitting the form", async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);
    const link = screen.getByTestId("register-login-link");
    expect(link).toHaveAttribute("href", "/login");
    expect(link.closest("form")).toBeNull();
    const fetchSpy = vi.spyOn(global, "fetch");
    await user.click(link);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getByText(/Etapa 1 de 2/)).toBeInTheDocument();
  });

  it("shows validation errors on empty register submit", async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findAllByRole("alert")).not.toHaveLength(0);
  });

  it("shows API error on login failure", async () => {
    const user = userEvent.setup();
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/auth/me") && (!init || !init.method || init.method === "GET")) {
        return {
          ok: false,
          status: 401,
          json: async () => ({ code: "unauthenticated", message: "Não autenticado." }),
        } as Response;
      }
      return {
        ok: false,
        status: 401,
        json: async () => ({ code: "invalid_credentials", message: "E-mail ou senha inválidos." }),
      } as Response;
    });

    render(<LoginForm />);
    await user.type(screen.getByLabelText("E-mail"), "a@b.com");
    await user.type(screen.getByLabelText("Senha"), "senha12345");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("E-mail ou senha inválidos.");
    });
    expect(screen.queryByRole("link", { name: "Abrir verificação" })).toBeNull();
    expect(screen.getByRole("link", { name: "Reenviar verificação" })).toBeInTheDocument();
  });

  it("links unverified login to verify-email", async () => {
    const user = userEvent.setup();
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/auth/me") && (!init || !init.method || init.method === "GET")) {
        return {
          ok: false,
          status: 401,
          json: async () => ({ code: "unauthenticated", message: "Não autenticado." }),
        } as Response;
      }
      return {
        ok: false,
        status: 403,
        json: async () => ({
          code: "email_unverified",
          message: "Confirme seu e-mail antes de entrar.",
        }),
      } as Response;
    });

    render(<LoginForm />);
    expect(screen.getByLabelText("Senha")).toHaveValue("");
    await user.type(screen.getByLabelText("E-mail"), "a@b.com");
    await user.type(screen.getByLabelText("Senha"), "senha12345");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("ainda não foi verificado");
    });
    expect(screen.getByRole("link", { name: "Abrir verificação" })).toHaveAttribute(
      "href",
      "/verify-email",
    );
    expect(screen.getByRole("link", { name: "Reenviar verificação" })).toHaveAttribute(
      "href",
      "/verify-email",
    );
  });

  it("shows verified banner after confirmation redirect", () => {
    searchParams = new URLSearchParams("verified=1");
    render(<LoginForm />);
    expect(screen.getByRole("status")).toHaveTextContent("E-mail confirmado");
    expect(screen.getByLabelText("Senha")).toHaveValue("");
  });

  it("toggles password visibility on login", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    const password = screen.getByLabelText("Senha");
    expect(password).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: "Mostrar valor" }));
    expect(password).toHaveAttribute("type", "text");
    await user.click(screen.getByRole("button", { name: "Ocultar valor" }));
    expect(password).toHaveAttribute("type", "password");
  });

  it("links to forgot password from login", () => {
    render(<LoginForm />);
    expect(screen.getByRole("link", { name: "Esqueci minha senha" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
  });
});

describe("Verify email form", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    replace.mockReset();
    refresh.mockReset();
    searchParams = new URLSearchParams();
  });

  it("does not claim success before API confirms", async () => {
    searchParams = new URLSearchParams("token=abc");
    let resolveFetch: (value: Response) => void = () => undefined;
    const pending = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    vi.spyOn(global, "fetch").mockReturnValue(pending);

    render(<VerifyEmailForm />);
    expect(screen.getByRole("status")).toHaveTextContent(/Confirmando|Preparando/);
    expect(screen.queryByText(/E-mail confirmado/i)).toBeNull();

    resolveFetch({
      ok: true,
      status: 200,
      json: async () => ({ message: "ok" }),
    } as Response);

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("E-mail confirmado");
    });
  });

  it("shows error and retry for invalid token without success", async () => {
    searchParams = new URLSearchParams("token=bad");
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        code: "invalid_verification_token",
        message: "Link de verificação inválido ou já utilizado.",
      }),
    } as Response);

    render(<VerifyEmailForm />);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Link de verificação inválido");
    });
    expect(screen.queryByText(/E-mail confirmado/i)).toBeNull();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
  });

  it("shows resend panel when token is absent", () => {
    render(<VerifyEmailForm />);
    expect(screen.getByRole("button", { name: "Reenviar e-mail de verificação" })).toBeInTheDocument();
    expect(screen.getByLabelText("E-mail")).toHaveValue("");
  });
});

describe("Official favicon assets", () => {
  it("ships Croniu mark derivatives and not the stock Next glyph alone", () => {
    const root = join(process.cwd());
    const mark = join(root, "public/brand/croniu-mark.png");
    const favicon = join(root, "src/app/favicon.ico");
    const icon = join(root, "src/app/icon.png");
    const apple = join(root, "src/app/apple-icon.png");
    const manifest = join(root, "public/manifest.webmanifest");

    expect(existsSync(mark)).toBe(true);
    expect(existsSync(favicon)).toBe(true);
    expect(existsSync(icon)).toBe(true);
    expect(existsSync(apple)).toBe(true);
    expect(readFileSync(favicon).byteLength).toBeGreaterThan(1000);
    expect(readFileSync(icon).byteLength).toBeGreaterThan(1000);

    const body = JSON.parse(readFileSync(manifest, "utf8")) as {
      icons: Array<{ src: string }>;
    };
    expect(body.icons.some((entry) => entry.src.includes("/icons/icon-192-v3.png"))).toBe(true);
    expect(body.icons.some((entry) => entry.src.includes("/icons/icon-512-v3.png"))).toBe(true);
    expect(body.icons.some((entry) => entry.src.includes("maskable"))).toBe(true);
    expect(body.icons.every((entry) => !entry.src.endsWith("/icons/icon-192.png"))).toBe(true);
  });
});
