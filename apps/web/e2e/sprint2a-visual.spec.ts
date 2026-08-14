import { expect, test } from "@playwright/test";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { registerProfessional } from "./register-flow";

const shotDir = path.join(__dirname, "artifacts", "sprint2a");

test.describe("sprint 2a visual QA", () => {
  test("capture key screens mobile and desktop", async ({ page }) => {
    mkdirSync(shotDir, { recursive: true });
    const suffix = Date.now();
    const email = `viz_${suffix}@example.com`;
    const password = "SenhaForte1!";

    await page.setViewportSize({ width: 390, height: 844 });
    await registerProfessional(page, {
      name: "Visual QA",
      org: `Studio Viz ${suffix}`,
      email,
      password,
    });
    await expect(page.getByRole("heading", { name: /Hoje|Bom |Boa / })).toBeVisible({
      timeout: 15_000,
    });
    await page.screenshot({ path: path.join(shotDir, "hoje-empty-390.png"), fullPage: true });

    await page.getByRole("link", { name: "Clientes" }).click();
    await page.screenshot({ path: path.join(shotDir, "clientes-empty-390.png"), fullPage: true });
    await page.getByRole("link", { name: /Adicionar / }).click();
    await page.getByLabel("Telefone (WhatsApp)").fill("11966665555");
    await page.getByRole("button", { name: "Salvar cliente" }).click();
    await expect(page.getByRole("heading", { name: "Cliente Visual" })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("link", { name: "Mais" }).click();
    await page.getByRole("link", { name: "Serviços e planos" }).click();
    await page.getByRole("link", { name: "Novo" }).click();
    await page.getByLabel("Nome").fill("Mensal Visual");
    await page.getByLabel("Valor (R$)").fill("280,00");
    await page.getByRole("button", { name: "Salvar serviço" }).click();
    await expect(page.getByText("Mensal Visual")).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: path.join(shotDir, "servicos-390.png"), fullPage: true });

    await page.getByRole("link", { name: "Ciclos" }).click();
    await page.getByRole("link", { name: "Novo" }).click();
    await page.screenshot({ path: path.join(shotDir, "ciclo-novo-390.png"), fullPage: true });
    await page.locator("select").nth(0).selectOption({ label: "Cliente Visual" });
    await page.locator("select").nth(1).selectOption({ label: "Mensal Visual" });
    const start = new Date();
    const end = new Date();
    end.setDate(end.getDate() + 2);
    await page.getByLabel("Início").fill(start.toISOString().slice(0, 10));
    await page.getByLabel("Fim").fill(end.toISOString().slice(0, 10));
    await page.getByRole("button", { name: "Criar ciclo" }).click();
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
    await expect(page.getByText(/Pago em/)).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: path.join(shotDir, "recebimento-pago-390.png"), fullPage: true });

    await page.getByRole("link", { name: "Hoje", exact: true }).click();
    await page.screenshot({ path: path.join(shotDir, "hoje-com-dados-390.png"), fullPage: true });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/app");
    await page.screenshot({ path: path.join(shotDir, "hoje-1280.png"), fullPage: true });
    await page.goto("/app/clients");
    await page.screenshot({ path: path.join(shotDir, "clientes-1280.png"), fullPage: true });
  });
});
