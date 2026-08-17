import { expect, test } from "@playwright/test";

import { loginUi, logoutUi } from "./helpers";
import { registerProfessional } from "./register-flow";

test.describe("Client portal stable access", () => {
  test("create, copy after reload and login, whatsapp, rotate and revoke", async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const email = `portal_${Date.now()}@example.com`;
    await registerProfessional(page, {
      name: "Pro portal",
      org: "Studio portal",
      email,
    });

    const created = await page.request.post("/api/v1/clients", {
      data: { full_name: "Renata Silva", phone: "11988887777" },
    });
    expect(created.ok()).toBeTruthy();
    const clientId = (await created.json()).id as string;

    await page.goto(`/app/clients/${clientId}?tab=dados`);
    const card = page.getByRole("region", { name: "Portal do cliente" });
    await expect(card.getByRole("heading", { name: "Portal do cliente" })).toBeVisible();
    await card.getByRole("button", { name: "Criar acesso" }).click();
    await expect(page.getByText("Acesso ativo")).toBeVisible();

    const urlEl = page.getByTestId("portal-url");
    const firstUrl = (await urlEl.textContent())?.trim() ?? "";
    expect(firstUrl).toMatch(/\/c\/v1\./);

    await page.getByRole("button", { name: "Copiar link" }).click();
    await expect(page.getByText("Link copiado")).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe(firstUrl);

    await page.reload();
    await expect(page.getByText("Acesso ativo")).toBeVisible();
    const afterReload = (await page.getByTestId("portal-url").textContent())?.trim() ?? "";
    expect(afterReload).toBe(firstUrl);
    await page.getByRole("button", { name: "Copiar link" }).click();
    await expect(page.getByText("Link copiado")).toBeVisible();
    const copiedAgain = await page.evaluate(() => navigator.clipboard.readText());
    expect(copiedAgain).toBe(firstUrl);

    await logoutUi(page);
    await loginUi(page, email);
    await page.goto(`/app/clients/${clientId}?tab=dados`);
    await expect(page.getByText("Acesso ativo")).toBeVisible();
    const afterLogin = (await page.getByTestId("portal-url").textContent())?.trim() ?? "";
    expect(afterLogin).toBe(firstUrl);

    const open = page.getByRole("link", { name: /Abrir portal/i });
    await expect(open).toHaveAttribute("href", expect.stringMatching(/^\/c\/v1\./));
    const wa = page.getByRole("link", { name: /Enviar pelo WhatsApp/i });
    const waHref = await wa.getAttribute("href");
    expect(waHref).toContain("wa.me");
    expect(decodeURIComponent(waHref || "")).toContain(firstUrl);
    await expect(wa).toHaveAttribute("rel", expect.stringContaining("noopener"));

    const token = firstUrl.split("/c/")[1];
    const portal = await context.newPage();
    await portal.goto(`/c/${token}`);
    await expect(portal.getByText(/Olá, Renata/i)).toBeVisible();
    await portal.close();

    const more = card.locator("details");
    await more.evaluate((el: HTMLDetailsElement) => {
      el.open = true;
    });
    await card.getByRole("button", { name: "Gerar novo link" }).click();
    await expect(page.getByRole("dialog", { name: "Gerar um novo link?" })).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Gerar novo link" }).click();
    await expect(page.getByTestId("portal-url")).not.toHaveText(firstUrl);
    const newUrl = (await page.getByTestId("portal-url").textContent())?.trim() ?? "";
    expect(newUrl).not.toBe(firstUrl);
    expect((await page.request.get(`/api/v1/public/my-cycle/${token}`)).status()).toBe(404);
    const newToken = newUrl.split("/c/")[1];
    expect((await page.request.get(`/api/v1/public/my-cycle/${newToken}`)).status()).toBe(200);

    await more.evaluate((el: HTMLDetailsElement) => {
      el.open = true;
    });
    await card.getByRole("button", { name: "Desativar acesso" }).click();
    await expect(page.getByRole("dialog", { name: "Desativar acesso?" })).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Desativar acesso" }).click();
    await expect(card.getByRole("button", { name: "Criar acesso" })).toBeVisible();
    expect((await page.request.get(`/api/v1/public/my-cycle/${newToken}`)).status()).toBe(404);

    await card.getByRole("button", { name: "Criar acesso" }).click();
    await expect(page.getByText("Acesso ativo")).toBeVisible();
    const restored = (await page.getByTestId("portal-url").textContent())?.trim() ?? "";
    expect(restored).toMatch(/\/c\/v1\./);
    expect(restored).not.toBe(firstUrl);
    expect(restored).not.toBe(newUrl);
  });
});
