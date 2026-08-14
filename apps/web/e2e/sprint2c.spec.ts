import { expect, test } from "@playwright/test";
import path from "node:path";
import { confirmIntelligentCycle, createServiceUi, createTemplateUi, nav, saveClient } from "./helpers";
import { registerProfessional } from "./register-flow";

const artifacts = path.join("e2e", "artifacts", "sprint2c");

async function register(page: import("@playwright/test").Page, prefix: string) {
  const email = `${prefix}_${Date.now()}@example.com`;
  await registerProfessional(page, { name: `Pro ${prefix}`, org: `Studio ${prefix}`, email });
}

test.describe("Sprint 2C cycle intelligence", () => {
  test("service, template, intelligent cycle with discount", async ({ page }) => {
    await register(page, "c2c");

    await createServiceUi(page, "Personal presencial", "90,00");
    await page.screenshot({ path: path.join(artifacts, "services.png"), fullPage: true });
    await createTemplateUi(page, "2x por semana — mensal");

    await saveClient(page, "Ana Souza");

    await nav(page, "Ciclos").click();
    await page.getByRole("link", { name: /Novo ciclo/ }).click();
    await confirmIntelligentCycle(page, {
      client: "Ana Souza",
      service: "Personal presencial",
      template: "2x por semana — mensal",
      startsOn: "2026-08-01",
      days: ["Ter", "Qui"],
      discount: "60,00",
    });
    await expect(page.getByRole("heading", { name: /Ana Souza/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/660/i).first()).toBeVisible();
  });
});
