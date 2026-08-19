import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";

const apiURL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8010";
const backendRoot = path.resolve(__dirname, "../../../backend");
const python = path.join(backendRoot, ".venv", "Scripts", "python.exe");
const DEFAULT_PASSWORD = "SenhaForte1!";

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

async function enableReferralPartner(
  request: import("@playwright/test").APIRequestContext,
  opts: { divulgadorEmail: string; code: string },
) {
  const suffix = Date.now();
  const adminEmail = `ops_ref_web_e2e_${suffix}@example.com`;
  const adminPassword = "AdminSenhaForte12!";
  bootstrapPlatformAdmin(adminEmail, adminPassword, "Operador Referral Web E2E");

  const divReg = await request.post(`${apiURL}/api/v1/auth/register`, {
    data: {
      email: opts.divulgadorEmail,
      password: DEFAULT_PASSWORD,
      full_name: "Divulgador Web E2E",
      organization_name: `Org Divulgador Web ${suffix}`,
    },
  });
  expect(divReg.ok(), await divReg.text()).toBeTruthy();
  const userId = (await divReg.json()).user.id as string;

  const login = await request.post(`${apiURL}/api/v1/platform/auth/login`, {
    data: { email: adminEmail, password: adminPassword },
  });
  expect(login.ok(), await login.text()).toBeTruthy();

  const enable = await request.post(`${apiURL}/api/v1/platform/referrals`, {
    data: { user_id: userId, code: opts.code, commission_percent: "10" },
  });
  expect(enable.ok(), await enable.text()).toBeTruthy();
}

test.describe("Referral program — web", () => {
  test("cupom válido no registro mostra banner e aplica 10% de desconto na assinatura", async ({
    page,
    request,
  }) => {
    const suffix = Date.now();
    const code = `E2EWEB${suffix.toString().slice(-6)}`;
    await enableReferralPartner(request, {
      divulgadorEmail: `divulgador_web_${suffix}@example.com`,
      code,
    });

    await page.goto(`/register?ref=${code}`);
    await expect(page.getByText(new RegExp(`Cupom ${code} aplicado`))).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/10% de desconto na assinatura/)).toBeVisible();

    await page.getByLabel("Seu nome").fill("Cliente Indicado");
    await page.getByLabel(/Nome do negócio/).fill(`Studio Indicado ${suffix}`);
    await page.getByLabel("E-mail").fill(`referred_web_e2e_${suffix}@example.com`);
    await page.getByLabel("Senha").fill(DEFAULT_PASSWORD);
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(page.getByText(/Etapa 2 de 2/)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("radio", { name: "Personal trainer" }).click();
    await page.getByRole("button", { name: "Criar minha conta" }).click();
    await expect(page).toHaveURL(/\/app/, { timeout: 45_000 });

    await page.goto("/app/billing");
    // Subtitle reflects the discounted entitlement price regardless of
    // whether card checkout is enabled in this environment.
    await expect(page.getByText(/plano mensal R\$\s?26,91/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Desconto vitalício de indicação")).toBeVisible();
    await expect(page.getByText(/−R\$\s?2,99/)).toBeVisible();
  });

  test("cadastro sem cupom mantém preço normal de R$ 29,90 sem exibir bloco de desconto", async ({
    page,
  }) => {
    const suffix = Date.now();
    await page.goto("/register");
    await expect(page.getByText(/Cupom .* aplicado/)).toHaveCount(0);

    await page.getByLabel("Seu nome").fill("Cliente Normal");
    await page.getByLabel(/Nome do negócio/).fill(`Studio Normal ${suffix}`);
    await page.getByLabel("E-mail").fill(`normal_web_e2e_${suffix}@example.com`);
    await page.getByLabel("Senha").fill(DEFAULT_PASSWORD);
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(page.getByText(/Etapa 2 de 2/)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("radio", { name: "Personal trainer" }).click();
    await page.getByRole("button", { name: "Criar minha conta" }).click();
    await expect(page).toHaveURL(/\/app/, { timeout: 45_000 });

    await page.goto("/app/billing");
    await expect(page.getByText(/plano mensal R\$\s?29,90/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Desconto vitalício de indicação")).toHaveCount(0);
  });

  test("item 'Meu link de indicação' só aparece para o divulgador habilitado", async ({
    page,
    request,
  }) => {
    const suffix = Date.now();
    const code = `E2EMENU${suffix.toString().slice(-6)}`;
    const divulgadorEmail = `divulgador_menu_e2e_${suffix}@example.com`;
    await enableReferralPartner(request, { divulgadorEmail, code });

    await page.goto("/login");
    await page.getByLabel("E-mail").fill(divulgadorEmail);
    await page.getByLabel("Senha").fill(DEFAULT_PASSWORD);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("heading", { name: /Hoje|Bom |Boa / })).toBeVisible({
      timeout: 20_000,
    });

    // This project runs mobile viewport by default: the item lives in the
    // avatar dropdown, not the (desktop-only) sidebar.
    await page.getByRole("button", { name: "Abrir menu da conta" }).click();
    await expect(
      page.getByRole("menuitem", { name: "Meu link de indicação" }),
    ).toBeVisible({ timeout: 15_000 });

    await page.goto("/app/referrals");
    await expect(page.getByRole("heading", { name: "Indique o Croniu" })).toBeVisible();
    await expect(page.getByText(code, { exact: true })).toBeVisible();
    await expect(page.getByText(/comiss/i)).toHaveCount(0);
  });
});
