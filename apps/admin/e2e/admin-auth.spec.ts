import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";

const apiURL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8010";
const backendRoot = path.resolve(__dirname, "../../../backend");
const python = path.join(backendRoot, ".venv", "Scripts", "python.exe");

function bootstrapPlatformAdmin(email: string, password: string, fullName: string) {
  execFileSync(
    python,
    ["-m", "app.cli.create_platform_admin", "--email", email, "--full-name", fullName],
    {
      cwd: backendRoot,
      env: {
        ...process.env,
        PLATFORM_ADMIN_PASSWORD: password,
        DATABASE_URL:
          process.env.DATABASE_URL ??
          "postgresql+psycopg://croniu:croniu_dev_password_change_me@localhost:5433/croniu",
        SECRET_KEY:
          process.env.SECRET_KEY ?? "dev-only-change-me-to-a-long-random-string-at-least-32-chars",
      },
      stdio: "pipe",
    },
  );
}

test.describe("platform admin", () => {
  test("anonymous is redirected from dashboard", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Entrar", exact: true })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("professional account cannot use admin login", async ({ page, request }) => {
    const suffix = Date.now();
    const email = `pro_admin_e2e_${suffix}@example.com`;
    const password = "SenhaForte1!";
    const reg = await request.post(`${apiURL}/api/v1/auth/register`, {
      data: {
        email,
        password,
        full_name: "Pro E2E",
        organization_name: `Org ${suffix}`,
      },
    });
    expect(reg.ok()).toBeTruthy();

    await page.goto("/login");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha").fill(password);
    await page.getByRole("button", { name: "Entrar no admin" }).click();
    await expect(page.getByText("Acesso administrativo negado.")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("platform admin can login, browse and logout", async ({ page }) => {
    const suffix = Date.now();
    const email = `ops_e2e_${suffix}@example.com`;
    const password = "AdminSenhaForte12!";
    bootstrapPlatformAdmin(email, password, "Operador E2E");

    await page.goto("/login");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha").fill(password);
    await page.getByRole("button", { name: "Entrar no admin" }).click();

    await expect(page.getByRole("heading", { name: "Visão geral", exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Profissionais")).toBeVisible();

    await page.getByRole("link", { name: "Organizações" }).click();
    await expect(page.getByRole("heading", { name: "Organizações", exact: true })).toBeVisible();

    await page.getByRole("link", { name: "Usuários" }).click();
    await expect(page.getByRole("heading", { name: "Usuários", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Sair" }).first().click();
    await expect(page.getByRole("heading", { name: "Entrar", exact: true })).toBeVisible({
      timeout: 15_000,
    });
  });
});
