import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const artifacts = path.join("e2e", "artifacts", "hml-smoke");
const password = "SenhaForte1!";

function shot(name: string) {
  fs.mkdirSync(artifacts, { recursive: true });
  return path.join(artifacts, name);
}

async function expectHome(page: Page) {
  await expect(page.getByRole("heading", { name: /Bom (dia|tarde|noite)/ })).toBeVisible({
    timeout: 20_000,
  });
}

async function logoutAndLogin(page: Page, email: string) {
  await page.getByRole("button", { name: "Abrir menu da conta" }).click();
  await page.getByRole("menuitem", { name: "Sair" }).click();
  await expect(page.getByRole("heading", { name: "Entrar", exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByLabel("E-mail").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expectHome(page);
}

async function apiJson(http: APIRequestContext, url: string) {
  const res = await http.get(url);
  return { status: res.status(), body: await res.json() };
}

async function createCycleViaUi(
  page: Page,
  opts: {
    clientId: string;
    serviceId: string;
    startsOn: string;
    time?: string;
    days?: string[];
  },
) {
  await page.goto("/app/cycles/new");
  await page.locator("select").nth(0).selectOption(opts.clientId);
  await page.locator("select").nth(1).selectOption(opts.serviceId);
  await page.locator("select").nth(2).selectOption({ index: 1 });
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Data de início do ciclo").fill(opts.startsOn);
  for (const day of opts.days ?? ["Seg", "Qua"]) {
    await page.getByRole("button", { name: day, exact: true }).click();
  }
  await page.getByRole("button", { name: "Calcular aulas" }).click();
  await expect(page.getByText(/Validade/)).toBeVisible({ timeout: 15_000 });
  if (opts.time) {
    await page.getByLabel("Horário").fill(opts.time);
  }
}

test.describe("HML final browser smoke", () => {
  test.describe.configure({ timeout: 240_000 });

  test("persistence, duplicate, overlap, sequential, conflict", async ({ page }) => {
    const suffix = Date.now();
    const email = `hml_smoke_${suffix}@example.com`;
    const clientName = `Aluno Smoke ${suffix}`;
    const otherName = `Aluno Conflito ${suffix}`;

    const registerRes = await page.request.post("/api/v1/auth/register", {
      data: {
        email,
        password,
        full_name: "Pro Smoke HML",
        organization_name: `Studio Smoke ${suffix}`,
        profession_code: "consultant",
        use_cases: ["plans_cycles", "appointments_agenda"],
      },
    });
    if (registerRes.status() !== 201) {
      throw new Error(`register ${registerRes.status()} ${await registerRes.text()}`);
    }
    await page.goto("/app");
    await expectHome(page);
    await page.screenshot({ path: shot("01-hoje-apos-registro.png"), fullPage: true });

    const service = await page.request.post("/api/v1/services", {
      data: {
        name: "Personal smoke",
        default_duration_minutes: 60,
        default_price_cents: 9000,
      },
    });
    expect(service.status()).toBe(201);
    const pilates = await page.request.post("/api/v1/services", {
      data: {
        name: "Pilates smoke",
        default_duration_minutes: 50,
        default_price_cents: 8000,
      },
    });
    expect(pilates.status()).toBe(201);
    const tmpl = await page.request.post("/api/v1/cycle-templates", {
      data: {
        name: "2x mensal smoke",
        weekly_frequency: 2,
        duration_type: "calendar_months",
        duration_value: 1,
      },
    });
    expect(tmpl.status()).toBe(201);
    const person = await page.request.post("/api/v1/clients", {
      data: { full_name: clientName, phone: "11988880001" },
    });
    expect(person.status()).toBe(201);
    const clientId = (await person.json()).id as string;
    const serviceId = (await service.json()).id as string;
    const pilatesId = (await pilates.json()).id as string;
    const other = await page.request.post("/api/v1/clients", {
      data: { full_name: otherName, phone: "11988880002" },
    });
    expect(other.status()).toBe(201);
    const otherId = (await other.json()).id as string;

    const beforeCycles = (await apiJson(page.request, "/api/v1/cycles")).body;
    const beforeRec = (await apiJson(page.request, "/api/v1/receivables")).body;
    expect(beforeCycles).toEqual([]);
    expect(beforeRec).toEqual([]);

    await page.goto(`/app/clients/${clientId}/accompaniment`);
    await expect(page.getByRole("heading", { name: /Preparar/ })).toBeVisible();
    await page.getByRole("button", { name: "Marcar como analisada" }).click();
    await expect(page.getByText("Concluído").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Marcar como analisada" })).toHaveCount(0);
    await page.screenshot({ path: shot("02-anamnese-analisada.png"), fullPage: true });

    await page.goto("/app");
    await page.goto(`/app/clients/${clientId}/accompaniment`);
    await expect(page.getByRole("button", { name: "Marcar como analisada" })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("button", { name: "Marcar como analisada" })).toHaveCount(0);

    await logoutAndLogin(page, email);
    await page.goto(`/app/clients/${clientId}/accompaniment`);
    await expect(page.getByRole("button", { name: "Marcar como analisada" })).toHaveCount(0);
    await page.screenshot({ path: shot("03-anamnese-apos-login.png"), fullPage: true });

    async function markOption(title: string, option: "Não se aplica" | "Fazer depois") {
      const row = page.locator("li").filter({ has: page.getByRole("heading", { name: title }) });
      await row.getByRole("button", { name: "Outras opções" }).click();
      await page.getByRole("button", { name: option }).click();
      await expect(row.getByText(option === "Fazer depois" ? "Adiado" : "Não se aplica")).toBeVisible();
    }

    await markOption("Avaliação", "Não se aplica");
    await page.screenshot({ path: shot("04-avaliacao-na.png"), fullPage: true });
    await markOption("Plano de acompanhamento", "Não se aplica");
    await page.reload();
    await expect(page.locator("li").filter({ hasText: "Avaliação" }).getByText("Não se aplica")).toBeVisible();
    await expect(
      page.locator("li").filter({ hasText: "Plano de acompanhamento" }).getByText("Não se aplica"),
    ).toBeVisible();

    await page.locator("li").filter({ has: page.getByRole("heading", { name: "Avaliação" }) }).getByRole("button", { name: "Alterar decisão" }).click();
    await page.getByRole("button", { name: "Reconsiderar" }).click();
    await markOption("Avaliação", "Fazer depois");
    await page.locator("li").filter({ has: page.getByRole("heading", { name: "Plano de acompanhamento" }) }).getByRole("button", { name: "Alterar decisão" }).click();
    await page.getByRole("button", { name: "Reconsiderar" }).click();
    await markOption("Plano de acompanhamento", "Fazer depois");
    await markOption("Rotina", "Não se aplica");
    await page.locator("li").filter({ has: page.getByRole("heading", { name: "Rotina" }) }).getByRole("button", { name: "Alterar decisão" }).click();
    await page.getByRole("button", { name: "Reconsiderar" }).click();
    await markOption("Rotina", "Fazer depois");
    await page.screenshot({ path: shot("05-checklist-later.png"), fullPage: true });

    await page.reload();
    await expect(page.locator("li").filter({ hasText: "Avaliação" }).getByText("Adiado")).toBeVisible();
    await expect(page.locator("li").filter({ hasText: "Plano de acompanhamento" }).getByText("Adiado")).toBeVisible();
    await expect(page.locator("li").filter({ hasText: "Rotina" }).getByText("Adiado")).toBeVisible();

    await logoutAndLogin(page, email);
    await page.goto(`/app/clients/${clientId}/accompaniment`);
    await expect(page.locator("li").filter({ hasText: "Avaliação" }).getByText("Adiado")).toBeVisible();
    await expect(page.locator("li").filter({ hasText: "Rotina" }).getByText("Adiado")).toBeVisible();
    await page.screenshot({ path: shot("06-checklist-apos-relogin.png"), fullPage: true });

    await createCycleViaUi(page, {
      clientId,
      serviceId,
      startsOn: "2026-08-17",
      time: "09:00",
    });
    await expect(page.getByText(/até antes de/)).toBeVisible();
    await page.screenshot({ path: shot("07-preview-ends-on-exclusivo.png"), fullPage: true });
    const dupWait = page.waitForResponse((r) => r.url().includes("/cycles/intelligent") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Confirmar ciclo" }).click();
    const createdRes = await dupWait;
    expect(createdRes.status()).toBe(201);
    const created = await createdRes.json();
    const cycleId = created.id as string;
    const endsOn = created.ends_on as string;
    expect(endsOn).toBe("2026-09-17");
    await expect(page).toHaveURL(new RegExp(`/app/cycles/${cycleId}|accompaniment`), { timeout: 20_000 });
    await page.screenshot({ path: shot("08-ciclo-criado.png"), fullPage: true });

    const afterCreate = await apiJson(page.request, "/api/v1/cycles");
    const recAfter = await apiJson(page.request, "/api/v1/receivables");
    expect(afterCreate.body.length).toBe(1);
    expect(recAfter.body.length).toBe(1);

    await createCycleViaUi(page, {
      clientId,
      serviceId,
      startsOn: "2026-08-17",
      time: "09:00",
    });
    const dupResP = page.waitForResponse((r) => r.url().includes("/cycles/intelligent") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Confirmar ciclo" }).click();
    const dupRes = await dupResP;
    expect(dupRes.status()).toBe(409);
    const dupBody = await dupRes.json();
    expect(dupBody.code).toBe("DUPLICATE_CYCLE");
    await expect(page.getByText("Já existe um ciclo igual para este cliente neste período.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Ver ciclo existente" })).toBeVisible();
    await page.screenshot({ path: shot("09-duplicate-cycle.png"), fullPage: true });
    expect((await apiJson(page.request, "/api/v1/cycles")).body.length).toBe(1);
    expect((await apiJson(page.request, "/api/v1/receivables")).body.length).toBe(1);

    await createCycleViaUi(page, {
      clientId,
      serviceId,
      startsOn: "2026-08-24",
      time: "09:00",
    });
    const ovP = page.waitForResponse((r) => r.url().includes("/cycles/intelligent") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Confirmar ciclo" }).click();
    const ovRes = await ovP;
    expect(ovRes.status()).toBe(409);
    expect((await ovRes.json()).code).toBe("OVERLAPPING_CYCLE");
    await expect(page.getByRole("button", { name: "Ajustar período" })).toBeVisible();
    await page.screenshot({ path: shot("10-overlapping-cycle.png"), fullPage: true });
    expect((await apiJson(page.request, "/api/v1/cycles")).body.length).toBe(1);

    await page.getByRole("button", { name: "Ajustar período" }).click();
    await page.getByLabel("Data de início do ciclo").fill(endsOn);
    await page.getByRole("button", { name: "Recalcular ciclo e valores" }).click();
    await expect(page.getByText(/Validade/)).toBeVisible({ timeout: 15_000 });
    const seqP = page.waitForResponse((r) => r.url().includes("/cycles/intelligent") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Confirmar ciclo" }).click();
    const seqRes = await seqP;
    expect(seqRes.status()).toBe(201);
    await page.screenshot({ path: shot("11-sequential-cycle.png"), fullPage: true });
    expect((await apiJson(page.request, "/api/v1/cycles")).body.length).toBe(2);
    expect((await apiJson(page.request, "/api/v1/receivables")).body.length).toBe(2);

    await createCycleViaUi(page, {
      clientId,
      serviceId: pilatesId,
      startsOn: "2026-08-17",
      time: "18:00",
      days: ["Seg", "Qua"],
    });
    const diffP = page.waitForResponse((r) => r.url().includes("/cycles/intelligent") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Confirmar ciclo" }).click();
    const diffRes = await diffP;
    expect(diffRes.status()).toBe(201);
    await page.screenshot({ path: shot("12-servico-diferente.png"), fullPage: true });

    const blockDay = "2026-10-05";
    const appt = await page.request.post("/api/v1/appointments", {
      data: {
        client_id: otherId,
        starts_at: "2026-10-05T07:00:00-03:00",
        ends_at: "2026-10-05T08:00:00-03:00",
      },
    });
    expect(appt.status()).toBe(201);
    const cyclesBeforeConflict = (await apiJson(page.request, "/api/v1/cycles")).body.length;
    const recBeforeConflict = (await apiJson(page.request, "/api/v1/receivables")).body.length;

    await createCycleViaUi(page, {
      clientId: otherId,
      serviceId,
      startsOn: blockDay,
      time: "07:00",
    });
    const confP = page.waitForResponse((r) => r.url().includes("/cycles/intelligent") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Confirmar ciclo" }).click();
    const confRes = await confP;
    expect(confRes.status()).toBe(409);
    expect((await confRes.json()).code).toBe("SCHEDULE_CONFLICT");
    await expect(page.getByText(/conflitos na agenda/i)).toBeVisible();
    await expect(page.getByLabel("Data de início do ciclo")).toHaveValue(blockDay);
    await page.screenshot({ path: shot("13-schedule-conflict.png"), fullPage: true });
    expect((await apiJson(page.request, "/api/v1/cycles")).body.length).toBe(cyclesBeforeConflict);
    expect((await apiJson(page.request, "/api/v1/receivables")).body.length).toBe(recBeforeConflict);

    await page.getByLabel("Horário").fill("18:00");
    const okP = page.waitForResponse((r) => r.url().includes("/cycles/intelligent") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Confirmar ciclo" }).click();
    expect((await okP).status()).toBe(201);
    await page.screenshot({ path: shot("14-ciclo-apos-ajuste.png"), fullPage: true });

    await page.goto(`/app/clients/${clientId}`);
    await page.screenshot({ path: shot("15-ficha.png"), fullPage: true });
    await page.goto(`/app/clients/${clientId}/accompaniment`);
    await page.screenshot({ path: shot("16-preparacao.png"), fullPage: true });
    await page.goto("/app/cycles");
    await page.screenshot({ path: shot("17-ciclos.png"), fullPage: true });
    await page.goto("/app/agenda");
    await page.screenshot({ path: shot("18-agenda.png"), fullPage: true });
    await page.goto("/app");
    await page.screenshot({ path: shot("19-hoje.png"), fullPage: true });
    await page.goto("/app/assistant");
    await page.screenshot({ path: shot("20-ia.png"), fullPage: true });

    await page.reload();
    await logoutAndLogin(page, email);
    await page.screenshot({ path: shot("21-hoje-relogin.png"), fullPage: true });
  });
});
