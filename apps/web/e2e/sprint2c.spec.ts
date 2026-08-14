import { expect, test } from "@playwright/test";
import path from "node:path";
import { registerProfessional } from "./register-flow";

const artifacts = path.join("e2e", "artifacts", "sprint2c");

async function register(page: import("@playwright/test").Page, prefix: string) {
  const email = `${prefix}_${Date.now()}@example.com`;
  await registerProfessional(page, { name: `Pro ${prefix}`, org: `Studio ${prefix}`, email });
}

function nav(page: import("@playwright/test").Page, name: string) {
  return page.getByRole("navigation").getByRole("link", { name, exact: true });
}

test.describe("Sprint 2C cycle intelligence", () => {
  test("service, template, intelligent cycle with discount", async ({ page }) => {
    await register(page, "c2c");

    await nav(page, "Mais").click();
    await page.getByRole("link", { name: "Serviços" }).click();
    await page.getByRole("link", { name: "Novo" }).click();
    await page.getByLabel("Nome").fill("Personal presencial");
    await page.getByLabel("Valor (R$)").fill("90,00");
    await page.getByRole("button", { name: "Salvar serviço" }).click();
    await expect(page.getByText("Personal presencial")).toBeVisible();
    await page.screenshot({ path: path.join(artifacts, "services.png"), fullPage: true });

    await nav(page, "Mais").click();
    await page.getByRole("link", { name: "Modelos de ciclo" }).click();
    await page.getByRole("link", { name: "Novo" }).click();
    await page.getByLabel("Nome").fill("2x por semana — mensal");
    await page.getByRole("button", { name: "Salvar modelo" }).click();
    await expect(page.getByText("2x por semana — mensal")).toBeVisible();

    await nav(page, "Clientes").click();
    await page.getByRole("link", { name: /Adicionar / }).click();
    await page.getByRole("button", { name: "Salvar cliente" }).click();
    await expect(page.getByRole("heading", { name: /Ana Souza/i })).toBeVisible();

    await nav(page, "Ciclos").click();
    await page.getByRole("link", { name: "Novo" }).click();
    await page.locator("select").nth(0).selectOption({ index: 1 });
    await page.locator("select").nth(1).selectOption({ index: 1 });
    await page.locator("select").nth(2).selectOption({ index: 1 });
    await page.getByRole("button", { name: "Continuar" }).click();

    // Pick a Monday start so Tue/Thu land cleanly in a month window
    await page.getByLabel("Data inicial").fill("2026-08-01");
    await page.getByRole("button", { name: "Ter" }).click();
    await page.getByRole("button", { name: "Qui" }).click();
    await page.getByRole("button", { name: "Calcular aulas" }).click();
    await expect(page.getByText(/8 aulas|Total/i).first()).toBeVisible({ timeout: 10000 });
    await page.getByLabel(/Desconto/).fill("60,00");
    await page.getByRole("button", { name: "Recalcular valores" }).click();
    await expect(page.getByText(/R\$\s*660,00|660/i).first()).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: path.join(artifacts, "cycle-preview.png"), fullPage: true });
    await page.getByRole("button", { name: "Confirmar ciclo" }).click();
    await expect(page.getByRole("heading", { name: /Ana Souza/i })).toBeVisible({
      timeout: 15000,
    });
  });
});
