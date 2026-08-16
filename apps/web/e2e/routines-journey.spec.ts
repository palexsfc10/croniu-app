import { expect, test, type Page } from "@playwright/test";
import { apiRegister, loginUi, logoutUi } from "./helpers";

async function createRoutineUi(
  page: Page,
  opts: { name: string; frequency: string; extra?: () => Promise<void> },
) {
  await page.goto("/app/routines");
  await page.getByRole("button", { name: /Criar rotina personalizada/i }).click();
  await expect(page.getByRole("heading", { name: "Nova rotina" })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByLabel("Nome", { exact: true }).fill(opts.name);
  await page.getByTestId("routine-frequency").selectOption({ label: opts.frequency });
  await page.getByLabel("Data de início").fill("2026-08-17");
  if (opts.extra) await opts.extra();
  await page.getByRole("button", { name: "Ver próxima ocorrência" }).click();
  await page.getByRole("button", { name: "Salvar rotina" }).click();
  await expect(page.getByText(opts.name).first()).toBeVisible();
}

test.describe("routine recurrence journeys", () => {
  test("weekly biweekly monthly custom once persist after reload and login", async ({ page }) => {
    const email = `rot_${Date.now()}@example.com`;
    await apiRegister(page, {
      name: "Pro Rotina",
      org: "Studio Rotina",
      email,
    });

    await createRoutineUi(page, { name: "Revisar planos do mês", frequency: "Toda semana" });
    await createRoutineUi(page, { name: "Pedir feedback", frequency: "A cada 15 dias" });
    await createRoutineUi(page, {
      name: "Avaliação mensal",
      frequency: "Uma vez por mês",
      extra: async () => {
        await page.getByLabel("Como no mês?").selectOption("Dia fixo do mês");
        await page.getByLabel("Dia do mês").fill("10");
      },
    });
    await createRoutineUi(page, {
      name: "Última segunda",
      frequency: "Uma vez por mês",
      extra: async () => {
        await page.getByLabel("Como no mês?").selectOption("Posição do dia da semana");
        await page.getByLabel("Qual ocorrência").selectOption("Última");
        await page.getByLabel("Dia da semana").selectOption("Segunda");
      },
    });
    await createRoutineUi(page, {
      name: "Intervalo 10 dias",
      frequency: "Personalizado",
      extra: async () => {
        await page.getByLabel("A cada").fill("10");
        await page.getByLabel("Unidade").selectOption("dias");
      },
    });
    await createRoutineUi(page, { name: "Contato único", frequency: "Uma única vez" });

    const listed = await page.request.get("/api/v1/routines");
    const rows = await listed.json();
    expect(rows.length).toBeGreaterThanOrEqual(6);
    const weekly = rows.find((r: { name: string }) => r.name === "Revisar planos do mês");
    expect(weekly.filter_json).toBeTruthy();
    const firstNext = weekly.next_run_on;
    const done = await page.request.post(`/api/v1/routines/${weekly.id}/complete`);
    expect(done.ok()).toBeTruthy();
    const doneBody = await done.json();
    expect(doneBody.next_run_on).not.toBe(firstNext);
    expect(doneBody.status).toBe("active");

    const once = rows.find((r: { name: string }) => r.name === "Contato único");
    const onceDone = await page.request.post(`/api/v1/routines/${once.id}/complete`);
    expect((await onceDone.json()).status).toBe("archived");

    await page.reload();
    await expect(page.getByText("Revisar planos do mês").first()).toBeVisible();
    await page.goto("/app");
    await logoutUi(page);
    await loginUi(page, email);
    await page.goto("/app/routines");
    await expect(page.getByText("Revisar planos do mês").first()).toBeVisible();
    const after = await (await page.request.get("/api/v1/routines")).json();
    expect(after.filter((r: { name: string }) => r.name === "Revisar planos do mês")).toHaveLength(1);
  });

  test("recurrence persisted in filter_json without migration", async ({ page }) => {
    await apiRegister(page, {
      name: "Pro Edges",
      org: "Studio Edges",
      email: `edge_${Date.now()}@example.com`,
    });

    const month31 = await page.request.post("/api/v1/routines", {
      data: {
        name: "Dia 31",
        task_type: "review_protocol",
        recurrence: "monthly",
        weekday: 0,
        filter_json: { month_mode: "dom", month_day: 31, starts_on: "2026-01-31", no_end: true },
      },
    });
    expect(month31.ok(), await month31.text()).toBeTruthy();
    const m31 = await month31.json();
    expect(m31.filter_json.month_day).toBe(31);
    expect(m31.filter_json.no_end).toBe(true);

    const lastMon = await page.request.post("/api/v1/routines", {
      data: {
        name: "Última segunda API",
        task_type: "review_protocol",
        recurrence: "monthly",
        weekday: 0,
        filter_json: {
          month_mode: "nth_weekday",
          nth: -1,
          nth_weekday: 0,
          starts_on: "2026-02-01",
          no_end: true,
        },
      },
    });
    expect(lastMon.ok(), await lastMon.text()).toBeTruthy();
    expect((await lastMon.json()).filter_json.nth).toBe(-1);

    const fifth = await page.request.post("/api/v1/routines", {
      data: {
        name: "Quinta ocorrência",
        task_type: "review_protocol",
        recurrence: "monthly",
        weekday: 0,
        filter_json: {
          month_mode: "nth_weekday",
          nth: 5,
          nth_weekday: 0,
          starts_on: "2026-02-01",
          no_end: true,
        },
      },
    });
    expect(fifth.ok(), await fifth.text()).toBeTruthy();
    const fifthBody = await fifth.json();
    expect(fifthBody.next_run_on).toBeTruthy();

    const once = await page.request.post("/api/v1/routines", {
      data: {
        name: "Once edge",
        task_type: "contact_client",
        recurrence: "once",
        weekday: 1,
        filter_json: { starts_on: "2026-08-18", no_end: true },
      },
    });
    const onceBody = await once.json();
    const first = await page.request.post(`/api/v1/routines/${onceBody.id}/complete`, {
      params: { occurrence_on: onceBody.next_run_on },
    });
    const second = await page.request.post(`/api/v1/routines/${onceBody.id}/complete`, {
      params: { occurrence_on: onceBody.next_run_on },
    });
    expect(first.ok()).toBeTruthy();
    expect(second.ok()).toBeTruthy();
    expect((await first.json()).status).toBe("archived");
    expect((await second.json()).status).toBe("archived");

    const listed = await page.request.get("/api/v1/routines");
    const names = (await listed.json()).map((r: { name: string }) => r.name);
    expect(names.filter((n: string) => n === "Dia 31")).toHaveLength(1);
  });
});
