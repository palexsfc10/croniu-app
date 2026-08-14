import { expect, test } from "@playwright/test";
import { apiRegister, loginUi, logoutUi, seedIntelligentCycleApi } from "./helpers";

test.describe("accompaniment tab and plan copy", () => {
  test("empty, partial, complete, error retry, viewports, no workout authoring", async ({ page }) => {
    const suffix = Date.now();
    await apiRegister(page, {
      name: "Pro Acc",
      org: `Studio Acc ${suffix}`,
      email: `acc_${suffix}@example.com`,
      profession: "personal_trainer",
    });

    const empty = await page.request.post("/api/v1/clients", {
      data: { full_name: "Cliente Novo", phone: "11910000001" },
    });
    const emptyId = (await empty.json()).id as string;
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(`/app/clients/${emptyId}?tab=acompanhamento`);
    const panel = page.getByRole("tabpanel", { name: "Acompanhamento" });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("heading", { name: "Ciclo atual" })).toBeVisible();
    await expect(page.getByTestId("accompaniment-plan-card")).toBeVisible();
    await expect(panel.getByRole("heading", { name: /plano de acompanhamento/i })).toBeVisible();
    await expect(panel.getByRole("heading", { name: "Avaliações" })).toBeVisible();
    await expect(panel.getByRole("heading", { name: "Rotinas" })).toBeVisible();
    await expect(panel.getByText("Defina a recorrência")).toBeVisible();
    await expect(page.getByText("Criar treino")).toHaveCount(0);

    await page.route("**/api/v1/clients/**/evaluations**", (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          status: 500,
          contentType: "application/json",
          body: '{"message":"fail"}',
        });
      }
      return route.continue();
    });
    await page.reload();
    await expect(page.getByRole("button", { name: "Tentar novamente" })).toBeVisible();
    await page.unroute("**/api/v1/clients/**/evaluations**");
    await page.getByRole("button", { name: "Tentar novamente" }).click();
    await expect(panel.getByRole("heading", { name: "Ciclo atual" })).toBeVisible();

    const partial = await seedIntelligentCycleApi(page, { clientName: "Cliente Parcial" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/app/clients/${partial.clientId}?tab=acompanhamento`);
    await expect(page.getByRole("button", { name: "Ver ciclo" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Criar plano" })).toBeVisible();

    const proto = await page.request.post("/api/v1/protocols", {
      data: {
        client_id: partial.clientId,
        title: "Estratégia do período",
        content_json: { objective: "consistência", external_url: "https://example.com/plan" },
      },
    });
    expect(proto.ok(), await proto.text()).toBeTruthy();
    const protoId = (await proto.json()).id as string;
    const published = await page.request.post(`/api/v1/protocols/${protoId}/publish`);
    expect(published.ok(), await published.text()).toBeTruthy();
    const ev = await page.request.post(`/api/v1/clients/${partial.clientId}/evaluations`, {
      data: {
        title: "Avaliação inicial",
        summary: "Evoluiu bem",
      },
    });
    expect(ev.ok(), await ev.text()).toBeTruthy();
    await page.setViewportSize({ width: 412, height: 915 });
    await page.goto(`/app/clients/${partial.clientId}?tab=acompanhamento`);
    await expect(page.getByText("Estratégia do período").first()).toBeVisible();
    await expect(page.getByText(/Avaliação inicial/).first()).toBeVisible();

    await page.goto(`/app/clients/${partial.clientId}/plans/new`);
    await expect(page.getByText(/o Croniu organiza o acompanhamento/i)).toBeVisible();
    await expect(page.getByText("Criar treino")).toHaveCount(0);

    await page.goto(`/app/clients/${partial.clientId}/evaluations/new`);
    await expect(page.getByPlaceholder("Ex.: Avaliação mensal")).toBeVisible();
    await expect(page.getByRole("button", { name: "Avaliação inicial" })).toBeVisible();

    await page.goto("/app");
    await logoutUi(page);
    await loginUi(page, `acc_${suffix}@example.com`);
    await page.goto(`/app/clients/${partial.clientId}?tab=acompanhamento`);
    await expect(page.getByRole("heading", { name: "Ciclo atual" })).toBeVisible();
  });
});
