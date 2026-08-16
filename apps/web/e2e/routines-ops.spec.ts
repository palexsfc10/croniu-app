import { expect, test, type Page } from "@playwright/test";
import { apiRegister, confirmIntelligentCycle, createServiceUi, createTemplateUi, loginUi, logoutUi, saveClient } from "./helpers";

async function localToday(page: Page) {
  const prefs = await page.request.get("/api/v1/organization/preferences");
  expect(prefs.ok()).toBeTruthy();
  return (await prefs.json()).local_today as string;
}

function shiftIso(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function createCalendarRoutine(page: Page, name: string, on: string) {
  const weekday = new Date(`${on}T00:00:00Z`).getUTCDay();
  const jsToPy = (weekday + 6) % 7;
  const res = await page.request.post("/api/v1/routines", {
    data: {
      name,
      task_type: "review_protocol",
      recurrence: "weekly",
      weekday: jsToPy,
      next_run_on: on,
      filter_json: { trigger_type: "calendar" },
    },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  return res.json();
}

async function boardItems(page: Page, on: string) {
  const board = await page.request.get(`/api/v1/routines/board?on=${on}`);
  expect(board.ok(), await board.text()).toBeTruthy();
  const groups = (await board.json()).groups as Array<{ items?: Array<{ id: string; name?: string; overdue?: boolean }> }>;
  return groups.flatMap((g) => g.items ?? []) as Array<{
    id: string;
    name?: string;
    overdue?: boolean;
    due_on?: string;
  }>;
}

async function seedCycleApi(page: Page, startsOn: string, durationDays: number, key: string) {
  const clientId = (await (await page.request.post("/api/v1/clients", { data: { full_name: "Ana Ciclo", phone: "11911112222" } })).json()).id;
  const serviceId = (
    await (
      await page.request.post("/api/v1/services", {
        data: { name: "Aula", default_duration_minutes: 60, default_duration_days: durationDays, default_price_cents: 9000 },
      })
    ).json()
  ).id;
  const templateId = (
    await (
      await page.request.post("/api/v1/cycle-templates", {
        data: { name: `Tpl ${key}`, weekly_frequency: 1, duration_type: "fixed_days", duration_value: durationDays },
      })
    ).json()
  ).id;
  const cycle = await page.request.post("/api/v1/cycles/intelligent", {
    data: {
      client_id: clientId,
      service_id: serviceId,
      cycle_template_id: templateId,
      starts_on: startsOn,
      weekdays: [(new Date(`${startsOn}T00:00:00Z`).getUTCDay() + 6) % 7],
      starts_time: "09:00:00",
      generate_appointments: true,
      create_receivable: false,
      idempotency_key: key,
    },
  });
  expect(cycle.ok(), await cycle.text()).toBeTruthy();
  return cycle.json() as Promise<{ id: string; starts_on: string; ends_on: string }>;
}

test("calendar routine appears on Agenda without opening Rotinas first", async ({ page }) => {
  await apiRegister(page, { name: "Pro Agenda", org: "Studio Agenda", email: `ag_${Date.now()}@example.com` });
  const today = await localToday(page);
  await createCalendarRoutine(page, "Revisar plano agenda", today);
  await page.goto(`/app/agenda?day=${today}`);
  await expect(page.getByRole("heading", { name: "Agenda" })).toBeVisible();
  await expect(page.getByText(today)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ações da rotina" })).toBeVisible();
  await expect(page.getByText("Revisar plano agenda").first()).toBeVisible();
});

test("agenda uses the selected day not today", async ({ page }) => {
  await apiRegister(page, { name: "Pro Dia", org: "Studio Dia", email: `day_${Date.now()}@example.com` });
  const today = await localToday(page);
  const other = shiftIso(today, 2);
  const weekday = new Date(`${other}T00:00:00Z`).getUTCDay();
  const seeded = await page.request.post("/api/v1/routines", {
    data: {
      name: "Só no outro dia",
      task_type: "review_protocol",
      recurrence: "weekly",
      weekday: (weekday + 6) % 7,
      next_run_on: other,
      filter_json: { trigger_type: "calendar", starts_on: other },
    },
  });
  expect(seeded.ok(), await seeded.text()).toBeTruthy();
  await page.goto(`/app/agenda?day=${other}`);
  await expect(page.getByText(other)).toBeVisible();
  await expect(page.getByText("Só no outro dia").first()).toBeVisible();
  await page.goto(`/app/agenda?day=${today}`);
  await expect(page.getByText(today)).toBeVisible();
  await expect(page.getByText("Só no outro dia")).toHaveCount(0);
});

test("today shows overdue and current actions then complete and defer", async ({ page }) => {
  await apiRegister(page, { name: "Pro Hoje", org: "Studio Hoje", email: `hoje_${Date.now()}@example.com` });
  const today = await localToday(page);
  const past = shiftIso(today, -3);
  await createCalendarRoutine(page, "Ação atual", today);
  await page.request.post("/api/v1/routines", {
    data: {
      name: "Ação atrasada",
      task_type: "send_feedback",
      recurrence: "weekly",
      weekday: (new Date(`${past}T00:00:00Z`).getUTCDay() + 6) % 7,
      next_run_on: past,
      filter_json: { trigger_type: "calendar" },
    },
  });
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Suas ações de hoje" })).toBeVisible();
  await expect(page.getByText("Ação atual").first()).toBeVisible();
  await expect(page.getByText("Ação atrasada").first()).toBeVisible();
  const items = await boardItems(page, today);
  const current = items.find((i) => i.name === "Ação atual");
  const overdue = items.find((i) => i.name === "Ação atrasada");
  expect(current).toBeTruthy();
  expect(overdue?.overdue).toBe(true);
  await page.goto(`/app/agenda?day=${today}`);
  await page.getByRole("button", { name: "Concluir" }).first().click();
  await page.getByRole("button", { name: "Adiar" }).first().click();
});

test("client_lifecycle is 422; cycle_lifecycle after starts_on, before ends_on, on ends_on", async ({ page }) => {
  await apiRegister(page, { name: "Pro Life", org: "Studio Life", email: `life_${Date.now()}@example.com` });
  const today = await localToday(page);
  const rejected = await page.request.post("/api/v1/routines", {
    data: {
      name: "Ausência",
      task_type: "contact_client",
      recurrence: "weekly",
      weekday: 1,
      filter_json: { trigger_type: "client_lifecycle" },
    },
  });
  expect(rejected.status()).toBe(422);

  const cycle = await seedCycleApi(page, today, 21, `cyc-${Date.now()}`);
  const afterStart = shiftIso(cycle.starts_on, 7);
  const beforeEnd = shiftIso(cycle.ends_on, -7);
  const onEnd = cycle.ends_on;

  for (const spec of [
    { name: "Após início", anchor: "starts_on", offset_days: 7, due: afterStart },
    { name: "Antes do fim", anchor: "ends_on", offset_days: 7, due: beforeEnd },
    { name: "No encerramento", anchor: "ends_on", offset_days: 0, due: onEnd },
  ]) {
    const created = await page.request.post("/api/v1/routines", {
      data: {
        name: spec.name,
        task_type: "prepare_renewal",
        recurrence: "once",
        filter_json: { trigger_type: "cycle_lifecycle", anchor: spec.anchor, offset_days: spec.offset_days },
      },
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    await page.request.get(`/api/v1/agenda/day?day=${spec.due}`);
    const items = await boardItems(page, spec.due);
    expect(items.some((i) => i.name === spec.name)).toBeTruthy();
  }
});

test("concurrent agenda reads stay unique; reload logout login keep routine", async ({ page }) => {
  const email = `conc_${Date.now()}@example.com`;
  await apiRegister(page, { name: "Pro Conc", org: "Studio Conc", email });
  const today = await localToday(page);
  await createCalendarRoutine(page, "Única ocorrência", today);
  const [a, b] = await Promise.all([
    page.request.get(`/api/v1/agenda/day?day=${today}`),
    page.request.get(`/api/v1/routines/board?on=${today}`),
  ]);
  expect(a.ok()).toBeTruthy();
  expect(b.ok()).toBeTruthy();
  const items = (await boardItems(page, today)).filter((i) => i.name === "Única ocorrência" && i.due_on === today);
  expect(new Set(items.map((i) => i.id)).size).toBe(1);
  expect(items).toHaveLength(1);
  await page.reload();
  await page.goto("/app/routines");
  await expect(page.getByText("Única ocorrência").first()).toBeVisible();
  await page.goto("/app");
  await logoutUi(page);
  await loginUi(page, email);
  await page.goto("/app/routines");
  await expect(page.getByText("Única ocorrência").first()).toBeVisible();
});

test("Renovações opens on Próximas and ficha cycle appears", async ({ page }) => {
  test.setTimeout(120_000);
  await apiRegister(page, {
    name: "Pro Ren",
    org: "Studio Ren",
    email: `ren_${Date.now()}@example.com`,
    profession: "personal_trainer",
  });
  await page.goto("/app/cycles");
  await expect(page.getByRole("heading", { name: "Renovações" })).toBeVisible();
  await expect(page.getByText("Próximas renovações")).toBeVisible();
  await saveClient(page, "Cliente Ficha");
  const clientMatch = page.url().match(/\/app\/clients\/[0-9a-f-]+/i);
  expect(clientMatch).toBeTruthy();
  const clientHref = clientMatch![0];
  await createServiceUi(page, "Mensal Ficha", "280,00");
  await createTemplateUi(page, "2x por semana — mensal");
  await page.goto(`/app/cycles/new?clientId=${clientHref.split("/").pop()}`);
  await confirmIntelligentCycle(page, {
    client: "Cliente Ficha",
    service: "Mensal Ficha",
    template: "2x por semana — mensal",
    startsOn: shiftIso(await localToday(page), -20),
    days: ["Ter", "Qui"],
  });
  await page.goto("/app/cycles");
  await expect(page.getByText("Cliente Ficha")).toBeVisible({ timeout: 15_000 });
});

test("MFIT link rejects javascript scheme", async ({ page }) => {
  await apiRegister(page, {
    name: "Pro MFIT",
    org: "Studio MFIT",
    email: `mfit_${Date.now()}@example.com`,
    profession: "personal_trainer",
  });
  const bad = await page.request.post("/api/v1/protocols", {
    data: {
      title: "Treino",
      protocol_type: "free",
      content_json: { external: { platform: "mfit", url: "javascript:alert(1)" } },
    },
  });
  expect(bad.status()).toBe(422);
  const ok = await page.request.post("/api/v1/protocols", {
    data: {
      title: "Treino",
      protocol_type: "free",
      content_json: { external: { platform: "mfit", url: "https://mfit.com.br/treino" } },
    },
  });
  expect(ok.ok(), await ok.text()).toBeTruthy();
});

test("tenant isolation hides other org occurrences", async ({ browser }) => {
  const a = await browser.newPage();
  const b = await browser.newPage();
  await apiRegister(a, { name: "Pro A", org: "Org A", email: `iso_a_${Date.now()}@example.com` });
  await apiRegister(b, { name: "Pro B", org: "Org B", email: `iso_b_${Date.now()}@example.com` });
  const today = await localToday(a);
  await createCalendarRoutine(a, "Segredo A", today);
  const itemsB = await boardItems(b, today);
  expect(itemsB.some((i) => i.name === "Segredo A")).toBeFalsy();
  await a.close();
  await b.close();
});

test("viewports 360 390 412 keep Rotinas nav", async ({ page }) => {
  await apiRegister(page, { name: "Pro VP", org: "Studio VP", email: `vp_${Date.now()}@example.com` });
  for (const width of [360, 390, 412] as const) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/app");
    await expect(page.getByRole("link", { name: "Rotinas" }).first()).toBeVisible();
    await page.goto("/app/routines");
    await expect(page.getByRole("heading", { name: "Sugestões para você" })).toBeVisible();
  }
});
