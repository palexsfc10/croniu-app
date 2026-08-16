import { expect, test } from "@playwright/test";
import { confirmIntelligentCycle, createServiceUi, createTemplateUi, logoutUi, nav, saveClient } from "./helpers";
import { registerProfessional } from "./register-flow";

async function register(page: import("@playwright/test").Page, prefix: string) {
  const email = `${prefix}_${Date.now()}@example.com`;
  await registerProfessional(page, { name: `Pro ${prefix}`, org: `Studio ${prefix}`, email });
  return email;
}

async function seedCycle(page: import("@playwright/test").Page) {
  await createServiceUi(page, "Personal presencial", "90,00");
  await createTemplateUi(page, "2x por semana — mensal");
  await saveClient(page, "Ana Souza");
  await confirmIntelligentCycle(page, {
    client: "Ana Souza",
    service: "Personal presencial",
    template: "2x por semana — mensal",
    startsOn: "2026-08-01",
    days: ["Ter", "Qui"],
  });
  await expect(page.getByRole("heading", { name: /Ana Souza/i })).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Sprint 2C.1 financial edit", () => {
  test("1 discount updates total and pending receivable", async ({ page }) => {
    await register(page, "c21a");
    await seedCycle(page);
    await page.getByRole("link", { name: "Editar valores" }).click();
    await expect(page).toHaveURL(/\/financial/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Editar valores" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/Agenda permanecerá igual/i)).toBeVisible();
    await page.getByLabel(/Desconto/).fill("60,00");
    await page.getByRole("button", { name: "Revisar e confirmar" }).click();
    await expect(page.getByText(/Novo total/i)).toBeVisible();
    await expect(page.getByText(/será atualizado/i)).toBeVisible();
    await page.getByRole("button", { name: "Confirmar alteração" }).click();
    await expect(page.getByText(/660/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/pendente|pending/i).first()).toBeVisible();
  });

  test("2 blocks edit after payment confirmed", async ({ page }) => {
    await register(page, "c21b");
    await seedCycle(page);
    const cyclePath = page.url();
    await page.getByRole("link", { name: /pendente|vence/i }).first().click();
    await page.getByRole("button", { name: "Marcar como pago" }).click();
    await expect(page.getByText(/Recebido em/)).toBeVisible();
    await page.goto(cyclePath);
    await page.getByRole("link", { name: "Editar valores" }).click();
    await expect(page).toHaveURL(/\/financial/, { timeout: 15_000 });
    await expect(page.getByText(/pagamento já foi confirmado/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Revisar/i })).toHaveCount(0);
  });

  test("3 tenant B cannot patch cycle A financial", async ({ page, request, baseURL }) => {
    await register(page, "c21isoA");
    await seedCycle(page);
    const cycleUrl = page.url();
    const cycleId = cycleUrl.split("/").pop()!;

    await logoutUi(page);

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
