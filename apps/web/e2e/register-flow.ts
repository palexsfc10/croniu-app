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
  await page.getByRole("button", { name: "Criar minha conta" }).click();
  // Cadastro enxuto: profissão migrou para o onboarding pós-login
  // (/app/onboarding). Pula o wizard aqui para manter o comportamento que os
  // demais specs esperam — cair direto no app autenticado.
  await expect(page).toHaveURL(/\/app/, { timeout: 45_000 });
  if (page.url().includes("/app/onboarding")) {
    await page.getByRole("button", { name: "Concluir depois" }).click();
    await expect(page).toHaveURL(/\/app$/, { timeout: 15_000 });
  }
}
