import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { apiRegister } from "./helpers";

async function completeTutorIntake(
  page: Page,
  invite: string,
  person: { name: string; phone: string; goal: string },
) {
  const contextResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      response.url().includes(`/api/v1/public/intake/${invite}`),
  );
  const navigation = await page.goto(`/entrar/${invite}`);
  expect(navigation?.headers()["cache-control"] || "").toMatch(
    /no-store|no-cache.*must-revalidate/,
  );
  expect((await contextResponse).headers()["cache-control"] || "").toContain("no-store");
  await expect(page.getByRole("heading", { name: /Cadastro inicial do aluno/i })).toBeVisible();
  await page.getByRole("button", { name: /Começar/i }).click();
  await expect(page.getByLabel(/Nome completo/i)).toHaveValue("");
  await expect(page.getByLabel(/Telefone/i)).toHaveValue("");
  await page.getByLabel(/Nome completo/i).fill(person.name);
  await page.getByLabel(/Telefone/i).fill(person.phone);
  await page.getByLabel(/Objetivo principal/i).fill(person.goal);
  await page.getByRole("checkbox", { name: /18 anos/i }).check();
  await page.getByRole("button", { name: /Continuar/i }).click();

  await page.getByLabel(/Matéria ou modalidade/i).fill("Matemática");
  await page.getByLabel(/objetivo de aprendizagem/i).fill(person.goal);
  await page.getByRole("button", { name: /Continuar/i }).click();
  for (const checkbox of await page.locator('input[type="checkbox"]').all()) {
    if (!(await checkbox.isChecked())) await checkbox.check();
  }
  await page.getByRole("button", { name: /Revisar/i }).click();
  await page.getByRole("button", { name: /Enviar cadastro/i }).click();
  await expect(page.getByRole("heading", { name: /Cadastro enviado/i })).toBeVisible();
}

async function assertNoSharedIntakeState(context: BrowserContext, page: Page) {
  const cookies = await context.cookies();
  expect(cookies.filter((cookie) => /intake|submission/i.test(cookie.name))).toEqual([]);
  const storage = await page.evaluate(() => ({
    local: Object.keys(localStorage),
    session: Object.keys(sessionStorage),
  }));
  expect(storage.local.filter((key) => /intake|submission/i.test(key))).toEqual([]);
  expect(storage.session.filter((key) => /intake|submission/i.test(key))).toEqual([]);
}

test("one permanent invite accepts isolated students A and B", async ({ page, browser }) => {
  const suffix = Date.now().toString().slice(-7);
  await apiRegister(page, {
    name: "Professora Hotfix",
    org: `Escola Hotfix ${suffix}`,
    email: `intake_hotfix_${suffix}@example.com`,
    profession: "private_tutor",
  });
  const linkResponse = await page.request.post("/api/v1/intake-link", { data: {} });
  expect(linkResponse.ok(), await linkResponse.text()).toBeTruthy();
  const invite = ((await linkResponse.json()) as { token: string }).token;

  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  await completeTutorIntake(pageA, invite, {
    name: "Aluno Isolado A",
    phone: "11931112222",
    goal: "Objetivo exclusivo A",
  });
  await assertNoSharedIntakeState(contextA, pageA);

  // Reopening the permanent invite after completion is a fresh enrollment,
  // even in the same anonymous browser context.
  await pageA.goto(`/entrar/${invite}`);
  await pageA.getByRole("button", { name: /Começar/i }).click();
  await expect(pageA.getByLabel(/Nome completo/i)).toHaveValue("");
  await expect(pageA.getByText("Aluno Isolado A")).toHaveCount(0);
  await contextA.close();

  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await pageB.setViewportSize({ width: 390, height: 844 });
  await completeTutorIntake(pageB, invite, {
    name: "Aluno Isolado B",
    phone: "11943334444",
    goal: "Objetivo exclusivo B",
  });
  await expect(pageB.getByText("Aluno Isolado A")).toHaveCount(0);
  await assertNoSharedIntakeState(contextB, pageB);
  await contextB.close();

  const submissions = await page.request.get("/api/v1/intake-submissions");
  expect(submissions.ok(), await submissions.text()).toBeTruthy();
  const rows = (await submissions.json()) as Array<{ id: string; full_name: string }>;
  const created = rows.filter((row) => /^Aluno Isolado [AB]$/.test(row.full_name));
  expect(created).toHaveLength(2);
  expect(new Set(created.map((row) => row.id)).size).toBe(2);

  await page.goto("/app/clients/intake");
  await expect(page.getByText("Aluno Isolado A")).toBeVisible();
  await expect(page.getByText("Aluno Isolado B")).toBeVisible();
});
