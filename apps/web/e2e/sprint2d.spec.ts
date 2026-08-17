import { expect, test } from "@playwright/test";

import { registerProfessional } from "./register-flow";

async function register(page: import("@playwright/test").Page, prefix: string) {
  const email = `${prefix}_${Date.now()}@example.com`;
  await registerProfessional(page, {
    name: `Pro ${prefix}`,
    org: `Studio ${prefix}`,
    email,
  });
  return email;
}

test.describe("Sprint 2D Meu Ciclo", () => {
  test("1 create link and open public portal", async ({ page }) => {
    await register(page, "s2d1");
    const client = await page.request.post("/api/v1/clients", {
      data: { full_name: "Renata Silva", phone: "11988887777" },
    });
    expect(client.ok()).toBeTruthy();
    const clientId = (await client.json()).id;

    await page.goto(`/app/clients/${clientId}?tab=dados`);
    await page.getByRole("button", { name: "Criar acesso" }).click();
    await expect(page.getByText(/Acesso ativo/i)).toBeVisible();
    const rotated = await page.request.post(`/api/v1/clients/${clientId}/public-access/rotate`);
    expect(rotated.ok()).toBeTruthy();
    const token = (await rotated.json()).token as string;
    await page.goto(`/c/${token}`);
    await expect(page.getByText(/Olá, Renata/i)).toBeVisible();
    await expect(page.getByText(/ainda não disponibilizou/i)).toBeVisible();
  });

  test("2 renewal idempotent and payment confirm", async ({ page, context }) => {
    await register(page, "s2d2");
    await page.request.put("/api/v1/organization/payment-settings", {
      data: {
        holder_name: "Studio",
        pix_key_type: "email",
        pix_key: "pix@studio.com",
        show_on_my_cycle: true,
      },
    });
    const clientRes = await page.request.post("/api/v1/clients", {
      data: { full_name: "Renata Silva", phone: "11988887777" },
    });
    const clientId = (await clientRes.json()).id;
    const serviceId = (
      await (
        await page.request.post("/api/v1/services", {
          data: {
            name: "Personal",
            default_price_cents: 9000,
            default_duration_minutes: 60,
          },
        })
      ).json()
    ).id;
    const templateId = (
      await (
        await page.request.post("/api/v1/cycle-templates", {
          data: {
            name: "2x mensal",
            weekly_frequency: 2,
            duration_type: "calendar_months",
            duration_value: 1,
          },
        })
      ).json()
    ).id;
    const cycle = await page.request.post("/api/v1/cycles/intelligent", {
      data: {
        client_id: clientId,
        service_id: serviceId,
        cycle_template_id: templateId,
        starts_on: "2026-07-14",
        weekdays: [1, 3],
        starts_time: "09:00:00",
        generate_appointments: true,
        idempotency_key: `e2e-${Date.now()}`,
      },
    });
    expect(cycle.ok()).toBeTruthy();

    const access = await page.request.post(`/api/v1/clients/${clientId}/public-access`);
    const token = (await access.json()).token as string;

    const portal = await context.newPage();
    await portal.goto(`/c/${token}`);
    await expect(portal.getByText(/Olá, Renata/i)).toBeVisible();
    await expect(portal.getByText(/no ciclo|restantes/i)).toBeVisible();

    await portal.getByRole("button", { name: "Quero continuar" }).click();
    await portal.getByRole("button", { name: "Enviar interesse" }).click();
    await expect(portal.getByText(/interesse foi enviado/i)).toBeVisible();
    const r1 = await portal.request.post(`/api/v1/public/my-cycle/${token}/renewal`);
    const r2 = await portal.request.post(`/api/v1/public/my-cycle/${token}/renewal`);
    expect(r1.ok()).toBeTruthy();
    expect(r2.ok()).toBeTruthy();
    const list = await page.request.get("/api/v1/renewal-requests");
    expect((await list.json()).length).toBe(1);

    await page.goto("/app");
    await expect(page.getByText(/Renovações solicitadas|Renovação solicitada/i).first()).toBeVisible({
      timeout: 15000,
    });

    await portal.getByRole("button", { name: "Já paguei" }).click();
    await portal.getByRole("button", { name: "Confirmar que paguei" }).click();
    await expect(portal.getByText(/Pagamento informado/i).first()).toBeVisible();

    const recvBefore = await page.request.get("/api/v1/receivables");
    expect((await recvBefore.json())[0].status).toBe("pending");

    await page.goto("/app/payment-reports");
    await page.getByRole("button", { name: "Confirmar pagamento" }).click();
    await expect(page.getByText(/Nenhum informe/i)).toBeVisible({ timeout: 15000 });

    await portal.reload();
    await expect(portal.getByText(/Pagamento confirmado/i)).toBeVisible();
  });

  test("3 rotate invalidates previous token", async ({ page }) => {
    await register(page, "s2d3");
    const clientId = (
      await (await page.request.post("/api/v1/clients", { data: { full_name: "Ana Souza" } })).json()
    ).id;
    const t1 = (await (await page.request.post(`/api/v1/clients/${clientId}/public-access`)).json())
      .token as string;
    const t2 = (
      await (await page.request.post(`/api/v1/clients/${clientId}/public-access/rotate`)).json()
    ).token as string;
    expect(t1).not.toBe(t2);
    expect((await page.request.get(`/api/v1/public/my-cycle/${t1}`)).status()).toBe(404);
    expect((await page.request.get(`/api/v1/public/my-cycle/${t2}`)).status()).toBe(200);
  });
});
