import { expect, test } from "@playwright/test";
import { registerProfessional } from "./register-flow";

async function register(page: import("@playwright/test").Page, prefix: string) {
  const email = `${prefix}_${Date.now()}@example.com`;
  await registerProfessional(page, { name: `Pro ${prefix}`, org: `Studio ${prefix}`, email });
  return email;
}

function nav(page: import("@playwright/test").Page, name: string) {
  return page.getByRole("navigation").getByRole("link", { name, exact: true });
}

async function seedCycle(page: import("@playwright/test").Page) {
  await nav(page, "Mais").click();
  await page.getByRole("link", { name: "Serviços" }).click();
  await page.getByRole("link", { name: "Novo" }).click();
  await page.getByLabel("Nome").fill("Personal presencial");
  await page.getByLabel("Valor por aula (R$)").fill("90,00");
  await page.getByRole("button", { name: "Salvar serviço" }).click();
  await expect(page.getByText("Personal presencial")).toBeVisible();

  await nav(page, "Mais").click();
  await page.getByRole("link", { name: "Modelos de ciclo" }).click();
  await page.getByRole("link", { name: "Novo" }).click();
  await page.getByLabel("Nome").fill("2x por semana — mensal");
  await page.getByRole("button", { name: "Salvar modelo" }).click();
  await expect(page.getByText("2x por semana — mensal")).toBeVisible();

  await nav(page, "Clientes").click();
  await page.getByRole("link", { name: "Novo" }).click();
  await page.getByLabel("Nome").fill("Ana Souza");
  await page.getByRole("button", { name: "Salvar cliente" }).click();

  // Prefer direct navigation — "Novo" on list can be unstable during fade-up animation.
  await page.goto("/app/cycles/new");
  await expect(page.getByRole("heading", { name: /Novo ciclo/i })).toBeVisible();
  await page.locator("select").nth(0).selectOption({ index: 1 });
  await page.locator("select").nth(1).selectOption({ index: 1 });
  await page.locator("select").nth(2).selectOption({ index: 1 });
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Data inicial").fill("2026-08-01");
  await page.getByRole("button", { name: "Ter" }).click();
  await page.getByRole("button", { name: "Qui" }).click();
  await page.getByRole("button", { name: "Calcular aulas" }).click();
  await expect(page.getByText(/Total/i).first()).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: "Confirmar ciclo" }).click();
  await expect(page.getByRole("heading", { name: /Ana Souza/i })).toBeVisible({
    timeout: 15000,
  });
}

test.describe("Sprint 2C.1 financial edit", () => {
  test("1 discount updates total and pending receivable", async ({ page }) => {
    await register(page, "c21a");
    await seedCycle(page);
    await page.getByRole("link", { name: "Editar valores" }).click();
    await expect(page.getByRole("heading", { name: "Editar valores" })).toBeVisible();
    await expect(page.getByText(/Agenda permanecerá igual/i)).toBeVisible();
    await page.getByLabel(/Desconto/).fill("60,00");
    await page.getByRole("button", { name: "Revisar e confirmar" }).click();
    await expect(page.getByText(/Novo total/i)).toBeVisible();
    await expect(page.getByText(/será atualizado/i)).toBeVisible();
    await page.getByRole("button", { name: "Confirmar alteração" }).click();
    await expect(page.getByText(/660/i).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/pendente|pending/i).first()).toBeVisible();
  });

  test("2 blocks edit after payment confirmed", async ({ page }) => {
    await register(page, "c21b");
    await seedCycle(page);
    await page.getByRole("link", { name: /pendente|vence/i }).first().click();
    await page.getByRole("button", { name: "Marcar como pago" }).click();
    await expect(page.getByText(/pago/i).first()).toBeVisible();
    await nav(page, "Ciclos").click();
    await page.getByText("Ana Souza").first().click();
    await page.getByRole("link", { name: "Editar valores" }).click();
    await expect(page.getByText(/pagamento já foi confirmado/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Revisar/i })).toHaveCount(0);
  });

  test("3 tenant B cannot patch cycle A financial", async ({ page, request, baseURL }) => {
    await register(page, "c21isoA");
    await seedCycle(page);
    const cycleUrl = page.url();
    const cycleId = cycleUrl.split("/").pop()!;

    await nav(page, "Mais").click();
    await page.getByRole("button", { name: "Sair" }).click();
    await expect(page).toHaveURL(/\/login/);

    await register(page, "c21isoB");
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const res = await request.patch(`${baseURL}/api/v1/cycles/${cycleId}/financial`, {
      headers: { Cookie: cookieHeader, "Content-Type": "application/json" },
      data: { final_cents: 100 },
    });
    expect([403, 404]).toContain(res.status());
  });
});
