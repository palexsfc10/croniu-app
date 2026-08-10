import { expect, test } from "@playwright/test";
import path from "node:path";

const shotDir = path.join(__dirname, "artifacts", "brand-wordmark");

test.describe("admin brand wordmark QA", () => {
  test("login shows wordmark and separate Admin label", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/login");
    await expect(page.getByRole("img", { name: "Croniu" })).toHaveCount(1);
    await expect(page.getByText("Admin", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Entrar", exact: true })).toBeVisible();
    await page.screenshot({
      path: path.join(shotDir, "admin-login-390.png"),
      fullPage: true,
    });
  });

  test("landing shows wordmark once", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await expect(page.getByRole("img", { name: "Croniu" })).toHaveCount(1);
    await page.screenshot({
      path: path.join(shotDir, "admin-landing-1280.png"),
      fullPage: true,
    });
  });
});
