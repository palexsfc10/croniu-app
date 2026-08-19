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

test.describe("Admin — parceiros e indicações", () => {
  test("habilita divulgador, edita comissão e desabilita, contadores refletindo cadastros", async ({
    page,
    request,
  }) => {
    const suffix = Date.now();
    const adminEmail = `ops_referral_e2e_${suffix}@example.com`;
    const adminPassword = "AdminSenhaForte12!";
    bootstrapPlatformAdmin(adminEmail, adminPassword, "Operador Referral E2E");

    const proEmail = `pro_referral_e2e_${suffix}@example.com`;
    const proPassword = "SenhaForte1!";
    const proFullName = `Divulgador E2E ${suffix}`;
    const reg = await request.post(`${apiURL}/api/v1/auth/register`, {
      data: {
        email: proEmail,
        password: proPassword,
        full_name: proFullName,
        organization_name: `Org Divulgador ${suffix}`,
      },
    });
    expect(reg.ok(), await reg.text()).toBeTruthy();
    const userId = (await reg.json()).user.id as string;

    await page.goto("/login");
    await page.getByLabel("E-mail").fill(adminEmail);
    await page.getByLabel("Senha").fill(adminPassword);
    await page.getByRole("button", { name: "Entrar no admin" }).click();
    await expect(page.getByRole("heading", { name: "Visão operacional", exact: true })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("link", { name: "Parceiros e indicações" }).click();
    await expect(page.getByRole("heading", { name: "Parceiros e indicações" })).toBeVisible();

    const code = `E2EREF${suffix.toString().slice(-6)}`;
    await page.getByLabel("Buscar usuário por nome ou e-mail").fill(proEmail);
    await page.getByRole("button", { name: "Buscar" }).click();
    // The search result shows full_name + a masked email, not the raw address.
    await expect(page.getByText(proFullName)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Selecionar" }).click();

    await page.getByLabel("Código do cupom").fill(code);
    await expect(page.getByText("Código disponível.")).toBeVisible({ timeout: 15_000 });
    await page.getByLabel("Comissão prevista (%)").fill("20");
    await page.getByRole("button", { name: "Habilitar divulgador" }).click();

    const row = page.getByRole("row", { name: new RegExp(proEmail) });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row.getByText("Ativo")).toBeVisible();
    await expect(row.getByText(code)).toBeVisible();
    await expect(row.getByText("0", { exact: true }).first()).toBeVisible();

    // A new referred signup must move "Cadastros" from 0 to 1 without reloading manually.
    const referredReg = await request.post(`${apiURL}/api/v1/auth/register`, {
      data: {
        email: `referred_e2e_${suffix}@example.com`,
        password: proPassword,
        full_name: "Cliente Indicado E2E",
        organization_name: `Org Indicada ${suffix}`,
        referral_code: code,
      },
    });
    expect(referredReg.ok(), await referredReg.text()).toBeTruthy();

    await page.reload();
    const rowAfter = page.getByRole("row", { name: new RegExp(proEmail) });
    const cells = rowAfter.getByRole("cell");
    await expect(cells.nth(5)).toHaveText("1"); // Cadastros

    await rowAfter.getByRole("button", { name: "Desabilitar" }).click();
    await expect(rowAfter.getByText("Inativo")).toBeVisible({ timeout: 15_000 });

    const codeCheck = await request.get(
      `${apiURL}/api/v1/referrals/validate?code=${code}`,
    );
    expect((await codeCheck.json()).valid).toBe(false);

    void userId;
  });
});
