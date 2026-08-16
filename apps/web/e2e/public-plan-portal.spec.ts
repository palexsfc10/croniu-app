import { expect, test } from "@playwright/test";
import { apiRegister } from "./helpers";

async function publishAndOpenPortal(
  page: import("@playwright/test").Page,
  opts: { profession: "personal_trainer" | "private_tutor"; heading: RegExp; title: string },
) {
  const suffix = Date.now().toString().slice(-6);
  await apiRegister(page, {
    name: `Pro ${opts.profession}`,
    org: `Studio Plan ${opts.profession} ${suffix}`,
    email: `plan_${opts.profession}_${suffix}@example.com`,
    profession: opts.profession,
  });
  const created = await page.request.post("/api/v1/clients", {
    data: { full_name: "Cliente Portal", phone: "11920000001" },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const clientId = (await created.json()).id as string;
  const proto = await page.request.post("/api/v1/protocols", {
    data: {
      title: opts.title,
      client_id: clientId,
      objective: "Objetivo do período",
      content_json: {
        strategy: "Resumo visível no portal",
        milestones: "Marco publicado",
        notes: "NUNCA_NO_PORTAL",
        external: {
          platform: "external",
          url: "https://example.com/portal-plan",
          title: "Material compartilhado",
          visible_to_client: true,
        },
      },
      duration_value: 12,
      duration_unit: "weeks",
    },
  });
  expect(proto.ok(), await proto.text()).toBeTruthy();
  const protoId = (await proto.json()).id as string;
  const published = await page.request.post(`/api/v1/protocols/${protoId}/publish`);
  expect(published.ok(), await published.text()).toBeTruthy();
  expect((await published.json()).status).toBe("published");

  const access = await page.request.post(`/api/v1/clients/${clientId}/public-access`);
  expect(access.ok(), await access.text()).toBeTruthy();
  const token = (await access.json()).token as string;
  await page.goto(`/c/${token}`);
  await expect(page.getByRole("heading", { name: opts.heading })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(opts.title)).toBeVisible();
  await expect(page.getByText("Resumo visível no portal")).toBeVisible();
  await expect(page.getByText("Marco publicado")).toBeVisible();
  await expect(page.getByRole("link", { name: "Material compartilhado" })).toBeVisible();
  await expect(page.getByText("NUNCA_NO_PORTAL")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: opts.heading })).toBeVisible();
  await expect(page.getByText(opts.title)).toBeVisible();
}

test("personal published plan appears on client portal after reload", async ({ page }) => {
  await publishAndOpenPortal(page, {
    profession: "personal_trainer",
    heading: /Plano de acompanhamento/i,
    title: "Plano de força",
  });
});

test("tutor published plan uses learning nomenclature on portal", async ({ page }) => {
  await publishAndOpenPortal(page, {
    profession: "private_tutor",
    heading: /Plano de aprendizagem/i,
    title: "Trilha de matemática",
  });
});
