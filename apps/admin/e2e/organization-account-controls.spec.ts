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

test.describe("Admin — controles de conta da organização (desktop)", () => {
  test("estender teste, desativar, bloquear login e reativar", async ({ page, request }) => {
    const suffix = Date.now();
    const adminEmail = `ops_account_ctrl_e2e_${suffix}@example.com`;
    const adminPassword = "AdminSenhaForte12!";
    bootstrapPlatformAdmin(adminEmail, adminPassword, "Operador Account Controls E2E");

    const proEmail = `pro_account_ctrl_e2e_${suffix}@example.com`;
    const proPassword = "SenhaForte1!";
    const orgName = `Org Account Controls ${suffix}`;
    const reg = await request.post(`${apiURL}/api/v1/auth/register`, {
      data: {
        email: proEmail,
        password: proPassword,
        full_name: "Titular Account Controls E2E",
        organization_name: orgName,
      },
    });
    expect(reg.ok(), await reg.text()).toBeTruthy();
    const orgId = (await reg.json()).organization.id as string;

    await page.goto("/login");
    await page.getByLabel("E-mail").fill(adminEmail);
    await page.getByLabel("Senha").fill(adminPassword);
    await page.getByRole("button", { name: "Entrar no admin" }).click();
    await expect(page.getByRole("heading", { name: "Visão geral", exact: true })).toBeVisible({
      timeout: 15_000,
    });

    await page.goto(`/organizations/${orgId}`);
    await expect(page.getByRole("heading", { name: orgName })).toBeVisible();

    // --- Estender teste ---
    const trialBefore = await page
      .locator("dt", { hasText: "Fim do período de teste" })
      .locator("xpath=following-sibling::dd")
      .innerText();

    await page.getByRole("button", { name: "+7 dias" }).click();
    await page
      .getByLabel("Motivo administrativo")
      .first()
      .fill("Cliente pediu mais tempo — teste E2E.");
    await page.getByRole("button", { name: "Estender teste" }).click();
    await page.getByRole("button", { name: "Confirmar extensão", exact: true }).click();
    await expect(page.getByText(/Teste estendido com sucesso/)).toBeVisible({ timeout: 15_000 });

    const trialAfter = await page
      .locator("dt", { hasText: "Fim do período de teste" })
      .locator("xpath=following-sibling::dd")
      .innerText();
    expect(trialAfter).not.toBe(trialBefore);

    // --- Desativar conta ---
    await page.getByLabel(/Digite o nome da organização/).fill(orgName);
    const deactivateSection = page
      .getByRole("heading", { name: "Desativar conta", level: 3 })
      .locator("xpath=..");
    await deactivateSection.getByLabel("Motivo administrativo").fill("Desativação de teste E2E.");
    await page.getByRole("button", { name: "Desativar conta" }).click();
    await page.getByRole("button", { name: "Confirmar desativação", exact: true }).click();
    await expect(page.getByText("Desativada", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Reativar conta" })).toBeVisible();

    const loginBlocked = await request.post(`${apiURL}/api/v1/auth/login`, {
      data: { email: proEmail, password: proPassword },
    });
    expect(loginBlocked.status()).toBe(403);
    expect((await loginBlocked.json()).code).toBe("organization_disabled");

    // --- Reativar ---
    await page.getByLabel("Motivo administrativo da reativação").fill("Reativação de teste E2E.");
    await page.getByRole("button", { name: "Reativar conta" }).click();
    await page.getByRole("button", { name: "Confirmar reativação", exact: true }).click();
    await expect(page.getByText("Desativada", { exact: true })).not.toBeVisible({ timeout: 15_000 });

    const loginRestored = await request.post(`${apiURL}/api/v1/auth/login`, {
      data: { email: proEmail, password: proPassword },
    });
    expect(loginRestored.ok(), await loginRestored.text()).toBeTruthy();
  });
});

test.describe("Admin — controles de conta da organização (mobile)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("seções de trial e área de perigo ficam acessíveis em viewport mobile", async ({
    page,
    request,
  }) => {
    const suffix = Date.now();
    const adminEmail = `ops_account_mobile_e2e_${suffix}@example.com`;
    const adminPassword = "AdminSenhaForte12!";
    bootstrapPlatformAdmin(adminEmail, adminPassword, "Operador Mobile E2E");

    const orgName = `Org Mobile Controls ${suffix}`;
    const reg = await request.post(`${apiURL}/api/v1/auth/register`, {
      data: {
        email: `pro_mobile_ctrl_e2e_${suffix}@example.com`,
        password: "SenhaForte1!",
        full_name: "Titular Mobile E2E",
        organization_name: orgName,
      },
    });
    expect(reg.ok(), await reg.text()).toBeTruthy();
    const orgId = (await reg.json()).organization.id as string;

    await page.goto("/login");
    await page.getByLabel("E-mail").fill(adminEmail);
    await page.getByLabel("Senha").fill(adminPassword);
    await page.getByRole("button", { name: "Entrar no admin" }).click();
    await expect(page.getByRole("heading", { name: "Visão geral", exact: true })).toBeVisible({
      timeout: 15_000,
    });

    await page.goto(`/organizations/${orgId}`);
    await expect(page.getByRole("heading", { name: orgName })).toBeVisible();

    await expect(page.getByRole("heading", { name: "Período de teste" })).toBeVisible();
    await expect(page.getByRole("button", { name: "+7 dias" })).toBeVisible();
    await page.getByRole("heading", { name: "Área de perigo" }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("heading", { name: "Área de perigo" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Desativar conta" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Excluir permanentemente" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ver o que será removido" })).toBeVisible();
  });
});
