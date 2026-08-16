import { expect, test } from "@playwright/test";
import { registerProfessional } from "./register-flow";

const apiURL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8010";

test.describe("auth vertical slice", () => {
  test("anonymous cannot stay on protected app without session", async ({ page }) => {
    await page.goto("/app");
    await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/login/);
  });

  test("register, open panel, logout, login again", async ({ page, request }) => {
    const suffix = Date.now();
    const email = `e2e_${suffix}@example.com`;
    const password = "SenhaForte1!";

    await registerProfessional(page, {
      name: "Profissional E2E",
      org: `Studio ${suffix}`,
      email,
      password,
    });

    await expect(page.getByRole("heading", { name: /Hoje|Bom |Boa / })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page).toHaveURL(/\/app/);

    await page.getByRole("button", { name: "Abrir menu da conta" }).click();
    await page.getByRole("menuitem", { name: "Sair" }).click();
    await expect(page.getByRole("heading", { name: "Entrar", exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page).toHaveURL(/login/);

    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha").fill(password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("heading", { name: /Hoje|Bom |Boa / })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page).toHaveURL(/\/app/);

    const health = await request.get(`${apiURL}/health`);
    expect(health.ok()).toBeTruthy();
  });

  test("manifest is available", async ({ request }) => {
    const response = await request.get("/manifest.webmanifest");
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.name).toBe("Croniu");
  });
});
