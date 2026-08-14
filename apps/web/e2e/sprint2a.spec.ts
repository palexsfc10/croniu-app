import { expect, test } from "@playwright/test";
import { apiRegister, confirmIntelligentCycle, createServiceUi, createTemplateUi, saveClient } from "./helpers";

test.describe("sprint 2a local flow", () => {
  test("client service cycle payment today flow", async ({ page }) => {
    const suffix = Date.now();
    await apiRegister(page, {
      name: "Profissional S2A",
      org: `Studio S2A ${suffix}`,
      email: `s2a_${suffix}@example.com`,
    });

    await saveClient(page, "Cliente S2A");
    await createServiceUi(page, "Mensal S2A", "350,00");
    await createTemplateUi(page, "2x por semana — mensal");
    await confirmIntelligentCycle(page, {
      client: "Cliente S2A",
      service: "Mensal S2A",
      template: "2x por semana — mensal",
      startsOn: "2026-08-01",
      days: ["Ter", "Qui"],
    });
    await expect(page.getByRole("heading", { name: "Cliente S2A" })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("button", { name: "Preparar mensagem WhatsApp" }).click();
    await expect(page.getByText("Mensagem pronta")).toBeVisible();
    await page.getByRole("button", { name: "Confirmar contato manualmente" }).click();
    await expect(page.getByText(/Contato confirmado/)).toBeVisible();

    await page.getByRole("link", { name: /R\$/ }).first().click();
    await page.getByRole("button", { name: "Marcar como pago" }).click();
    await expect(page.getByText(/Recebido em/)).toBeVisible({ timeout: 15_000 });

    await page.goto("/app");
    await expect(page.getByRole("heading", { name: /Hoje|Bom |Boa / })).toBeVisible();
  });
});
