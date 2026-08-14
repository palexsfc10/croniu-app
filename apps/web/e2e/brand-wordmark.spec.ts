import { expect, test } from "@playwright/test";
import path from "node:path";
import { registerProfessional } from "./register-flow";

const shotDir = path.join(__dirname, "artifacts", "brand-wordmark");

test.describe("brand wordmark QA", () => {
  test("login layouts and single wordmark", async ({ page }) => {
    const widths = [320, 375, 390, 1280] as const;
    for (const width of widths) {
      await page.setViewportSize({ width, height: width >= 1280 ? 800 : 720 });
      await page.goto("/login");
      await expect(page.getByRole("img", { name: "Croniu" })).toHaveCount(1);
      await expect(page.getByRole("heading", { name: "Entrar", exact: true })).toBeVisible();
      const header = page.locator("header").first();
      const mark = page.getByRole("img", { name: "Croniu" });
      const headerBox = await header.boundingBox();
      const markBox = await mark.boundingBox();
      expect(headerBox && markBox).toBeTruthy();
      if (headerBox && markBox) {
        // Wordmark sits on the right half of the auth header
        expect(markBox.x).toBeGreaterThan(headerBox.x + headerBox.width / 2 - 8);
      }
      await page.screenshot({
        path: path.join(shotDir, `login-${width}.png`),
        fullPage: true,
      });
    }
  });

  test("register has back left and wordmark right", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/register");
    await expect(page.getByRole("link", { name: "Voltar" })).toBeVisible();
    await expect(page.getByRole("img", { name: "Croniu" })).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "Crie sua conta", exact: true })).toBeVisible();
    await page.screenshot({
      path: path.join(shotDir, "register-390.png"),
      fullPage: true,
    });
  });

  test("manifest keeps plain Croniu name", async ({ request }) => {
    const response = await request.get("/manifest.webmanifest");
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.name).toBe("Croniu");
    expect(body.short_name).toBe("Croniu");
  });

  test("authenticated header uses single wordmark", async ({ page }) => {
    const suffix = Date.now();
    const email = `brand_${suffix}@example.com`;
    const password = "SenhaForte1!";

    await page.setViewportSize({ width: 390, height: 844 });
    await registerProfessional(page, {
      name: "Brand QA",
      org: `Studio ${suffix}`,
      email,
      password,
    });
    await expect(page.getByRole("heading", { name: "Hoje", exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("img", { name: "Croniu" })).toHaveCount(1);
    await page.screenshot({
      path: path.join(shotDir, "hoje-390.png"),
      fullPage: true,
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/app");
    await expect(page.getByRole("img", { name: "Croniu" })).toHaveCount(1);
    await page.screenshot({
      path: path.join(shotDir, "hoje-header-1280.png"),
      fullPage: true,
    });
  });
});
