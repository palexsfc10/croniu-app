import { expect, test } from "@playwright/test";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { apiRegister, confirmIntelligentCycle, createServiceUi, createTemplateUi, saveClient } from "./helpers";

const shotDir = path.join(__dirname, "artifacts", "sprint2a");

test.describe("sprint 2a visual QA", () => {
  test("capture key screens mobile and desktop", async ({ page }) => {
    mkdirSync(shotDir, { recursive: true });
    const suffix = Date.now();

    await page.setViewportSize({ width: 390, height: 844 });
    await apiRegister(page, {
      name: "Visual QA",
      org: `Studio Viz ${suffix}`,
      email: `viz_${suffix}@example.com`,
    });
    await page.screenshot({ path: path.join(shotDir, "hoje-empty-390.png"), fullPage: true });

    await page.getByRole("link", { name: "Clientes" }).click();
    await page.screenshot({ path: path.join(shotDir, "clientes-empty-390.png"), fullPage: true });
    await saveClient(page, "Cliente Visual", "11966665555");

    await createServiceUi(page, "Mensal Visual", "280,00");
    await page.screenshot({ path: path.join(shotDir, "servicos-390.png"), fullPage: true });
    await createTemplateUi(page, "2x por semana — mensal");

    await page.goto("/app/cycles");
    await page.getByRole("link", { name: /Novo ciclo/ }).click();
    await page.screenshot({ path: path.join(shotDir, "ciclo-novo-390.png"), fullPage: true });
    await confirmIntelligentCycle(page, {
      client: "Cliente Visual",
      service: "Mensal Visual",
      template: "2x por semana — mensal",
      startsOn: "2026-08-01",
      days: ["Ter", "Qui"],
    });
    await expect(page.getByRole("heading", { name: "Cliente Visual" })).toBeVisible({
      timeout: 15_000,
    });
    await page.screenshot({ path: path.join(shotDir, "ciclo-detalhe-390.png"), fullPage: true });

    await page.getByRole("button", { name: "Preparar mensagem WhatsApp" }).click();
    await expect(page.getByText("Mensagem pronta")).toBeVisible();
    await page.screenshot({ path: path.join(shotDir, "whatsapp-prep-390.png"), fullPage: true });
    await page.getByRole("button", { name: "Confirmar contato manualmente" }).click();

    await page.getByRole("link", { name: /R\$/ }).first().click();
    await page.screenshot({ path: path.join(shotDir, "recebimento-pendente-390.png"), fullPage: true });
    await page.getByRole("button", { name: "Marcar como pago" }).click();
    await expect(page.getByText(/Recebido em/)).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: path.join(shotDir, "recebimento-pago-390.png"), fullPage: true });

    await page.goto("/app");
    await page.screenshot({ path: path.join(shotDir, "hoje-com-dados-390.png"), fullPage: true });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/app");
    await page.screenshot({ path: path.join(shotDir, "hoje-1280.png"), fullPage: true });
    await page.goto("/app/clients");
    await page.screenshot({ path: path.join(shotDir, "clientes-1280.png"), fullPage: true });
  });
});
