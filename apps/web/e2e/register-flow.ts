import { expect, type Page } from "@playwright/test";

export async function registerProfessional(
  page: Page,
  opts: { name: string; org: string; email: string; password?: string },
) {
  await page.goto("/register");
  await page.getByLabel("Seu nome").fill(opts.name);
  await page.getByLabel(/Nome do negócio/).fill(opts.org);
  await page.getByLabel("E-mail").fill(opts.email);
  const password = opts.password ?? "SenhaForte1!";
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByText(/Etapa 2 de 2/)).toBeVisible({ timeout: 15_000 });
  await page.getByRole("radio", { name: "Personal trainer" }).click();
  await page.getByRole("button", { name: "Criar minha conta" }).click();
  await expect(page).toHaveURL(/\/app/, { timeout: 45_000 });
}
