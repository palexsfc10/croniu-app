import { expect, test } from "@playwright/test";

test.describe("sprint 2a local flow", () => {
  test("client service cycle payment today flow", async ({ page }) => {
    const suffix = Date.now();
    const email = `s2a_${suffix}@example.com`;
    const password = "SenhaForte1!";

    await page.goto("/register");
    await page.getByLabel("Seu nome").fill("Profissional S2A");
    await page.getByLabel("Nome do negócio / organização").fill(`Studio S2A ${suffix}`);
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha").fill(password);
    await page.getByRole("button", { name: "Criar conta" }).click();
    await expect(page.getByRole("heading", { name: "Hoje", exact: true })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("link", { name: "Clientes" }).click();
    await page.getByRole("link", { name: "Novo" }).click();
    await page.getByLabel("Nome").fill("Cliente S2A");
    await page.getByLabel("Telefone (WhatsApp)").fill("11977776666");
    await page.getByRole("button", { name: "Salvar cliente" }).click();
    await expect(page.getByRole("heading", { name: "Cliente S2A" })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("link", { name: "Mais" }).click();
    await page.getByRole("link", { name: "Serviços e planos" }).click();
    await page.getByRole("link", { name: "Novo" }).click();
    await page.getByLabel("Nome").fill("Mensal S2A");
    await page.getByLabel("Duração padrão (dias)").fill("30");
    await page.getByLabel("Valor padrão (R$)").fill("350,00");
    await page.getByRole("button", { name: "Salvar serviço" }).click();
    await expect(page.getByText("Mensal S2A")).toBeVisible({ timeout: 15_000 });

    await page.getByRole("link", { name: "Ciclos" }).click();
    await page.getByRole("link", { name: "Novo" }).click();
    await page.locator("select").nth(0).selectOption({ label: "Cliente S2A" });
    await page.locator("select").nth(1).selectOption({ label: "Mensal S2A" });
    const start = new Date();
    const end = new Date();
    end.setDate(end.getDate() + 3);
    await page.getByLabel("Início").fill(start.toISOString().slice(0, 10));
    await page.getByLabel("Fim").fill(end.toISOString().slice(0, 10));
    await page.getByRole("button", { name: "Criar ciclo" }).click();
    await expect(page.getByRole("heading", { name: "Cliente S2A" })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("button", { name: "Preparar mensagem WhatsApp" }).click();
    await expect(page.getByText("Mensagem pronta")).toBeVisible();
    await page.getByRole("button", { name: "Confirmar contato manualmente" }).click();
    await expect(page.getByText(/Contato confirmado/)).toBeVisible();

    await page.getByRole("link", { name: /R\$/ }).first().click();
    await page.getByRole("button", { name: "Marcar como pago" }).click();
    await expect(page.getByText(/Pago em/)).toBeVisible({ timeout: 15_000 });

    await page.getByRole("link", { name: "Hoje", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Hoje", exact: true })).toBeVisible();
  });
});
