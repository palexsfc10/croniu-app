import { expect, test } from "@playwright/test";
import path from "node:path";
import { registerProfessional } from "./register-flow";
import { saveClient } from "./helpers";

const artifacts = path.join("e2e", "artifacts", "sprint2b");

async function registerOrg(page: import("@playwright/test").Page, prefix: string) {
  const email = `${prefix}_${Date.now()}@example.com`;
  const password = "SenhaForte1!";
  await registerProfessional(page, {
    name: `Pro ${prefix}`,
    org: `Studio ${prefix}`,
    email,
    password,
  });
  return { email, password };
}

function nav(page: import("@playwright/test").Page, name: "Hoje" | "Agenda" | "Clientes" | "Ciclos" | "Mais") {
  return page.getByRole("navigation").getByRole("link", { name, exact: true });
}

test.describe("Sprint 2B agenda core", () => {
  test("location, appointment, agenda, today, conflict", async ({ page }) => {
    await registerOrg(page, "agenda");

    await nav(page, "Mais").click();
    await page.getByRole("link", { name: /Preferências/i }).click();
    await expect(page.getByRole("heading", { name: /Preferências/i })).toBeVisible();
    await page.screenshot({ path: path.join(artifacts, "preferences-timezone.png"), fullPage: true });

    await nav(page, "Mais").click();
    await page.getByRole("link", { name: "Locais" }).click();
    await expect(page.getByRole("heading", { name: "Locais" })).toBeVisible();
    await page.screenshot({ path: path.join(artifacts, "locations-empty.png"), fullPage: true });
    await page.getByRole("link", { name: "Novo" }).click();
    await page.getByLabel("Nome").fill("Academia Centro");
    await page.getByLabel("Endereço").fill("Rua A, 100");
    await page.getByRole("button", { name: "Salvar local" }).click();
    await expect(page.getByRole("heading", { name: "Editar local" })).toBeVisible({
      timeout: 15_000,
    });
    await page.screenshot({ path: path.join(artifacts, "locations-edit.png"), fullPage: true });

    await saveClient(page, "Ana Souza");

    await nav(page, "Agenda").click();
    await page.screenshot({ path: path.join(artifacts, "agenda-empty-mobile.png"), fullPage: true });
    await page.getByRole("link", { name: "Novo" }).click();
    await page.getByRole("combobox", { name: "Cliente", exact: true }).selectOption({ label: "Ana Souza" });
    await page.getByRole("combobox", { name: "Local (opcional)" }).selectOption({ label: "Academia Centro" });
    await page.getByRole("button", { name: "Criar compromisso" }).click();
    await expect(page.getByRole("heading", { name: "Compromisso" })).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: path.join(artifacts, "appointment-created.png"), fullPage: true });

    await nav(page, "Agenda").click();
    await expect(page.getByText("Ana Souza").first()).toBeVisible();
    await page.screenshot({ path: path.join(artifacts, "agenda-filled-mobile.png"), fullPage: true });

    await page.keyboard.press("Escape");
    await page.goto("/app");
    await expect(page.getByRole("heading", { name: /Hoje|Bom |Boa / })).toBeVisible();
    await expect(page.getByText("Ana Souza").first()).toBeVisible();
    await page.screenshot({ path: path.join(artifacts, "today-with-appointment.png"), fullPage: true });

    await nav(page, "Agenda").click();
    await page.getByRole("link", { name: "Novo" }).click();
    await page.getByRole("combobox", { name: "Cliente", exact: true }).selectOption({ label: "Ana Souza" });
    await page.getByRole("button", { name: "Criar compromisso" }).click();
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: path.join(artifacts, "appointment-conflict.png"), fullPage: true });

    await nav(page, "Agenda").click();
    await page.getByRole("link", { name: /Ana Souza/i }).first().click();
    await page.getByRole("button", { name: "Marcar como realizado" }).click();
    await expect(page).toHaveURL(/\/app/);
  });

  test("tenant isolation for location uuid", async ({ page, request, baseURL }) => {
    await registerOrg(page, "isoA");
    await nav(page, "Mais").click();
    await page.getByRole("link", { name: "Locais" }).click();
    await page.getByRole("link", { name: "Novo" }).click();
    await expect(page.getByRole("heading", { name: /Novo local|Local/i })).toBeVisible();
    await page.getByLabel("Nome").fill("Local A");
    await page.getByRole("button", { name: "Salvar local" }).click();
    await expect(page.getByRole("heading", { name: "Editar local" })).toBeVisible({ timeout: 15000 });
    const locationId = page.url().split("/").pop()!;

    await nav(page, "Mais").click();
    await page.getByRole("button", { name: "Abrir menu da conta" }).click();
    await page.getByRole("menuitem", { name: "Sair" }).click();
    await expect(page).toHaveURL(/\/login/);

    await registerOrg(page, "isoB");
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const res = await request.get(`${baseURL}/api/v1/locations/${locationId}`, {
      headers: { Cookie: cookieHeader },
    });
    expect([403, 404]).toContain(res.status());
  });
});
