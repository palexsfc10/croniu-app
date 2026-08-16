import { expect, type Page } from "@playwright/test";

export const DEFAULT_PASSWORD = "SenhaForte1!";

export async function apiRegister(
  page: Page,
  opts: { name: string; org: string; email: string; profession?: string },
) {
  const res = await page.request.post("/api/v1/auth/register", {
    data: {
      full_name: opts.name,
      organization_name: opts.org,
      email: opts.email,
      password: DEFAULT_PASSWORD,
      profession_code: opts.profession ?? "consultant",
      profession_other: opts.profession === "other" ? "Consultoria independente" : undefined,
      use_cases: ["plans_cycles", "appointments_agenda"],
    },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: /Hoje|Bom |Boa / })).toBeVisible({
    timeout: 30_000,
  });
}

export async function saveClient(page: Page, name: string, phone = "11977776666") {
  await page.goto("/app/clients/new");
  await page.getByLabel("Nome", { exact: true }).fill(name);
  await page.getByLabel("Telefone (WhatsApp)").fill(phone);
  await page.getByRole("button", { name: "Salvar cliente" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible({ timeout: 15_000 });
}

export async function createServiceUi(page: Page, name: string, price = "90,00") {
  await page.goto("/app/services/new");
  await expect(page.getByRole("heading", { name: "Novo serviço" })).toBeVisible();
  await page.getByLabel("Nome", { exact: true }).fill(name);
  await page.getByLabel("Valor (R$)", { exact: true }).fill(price);
  await page.getByRole("button", { name: "Salvar serviço" }).click();
  await expect(page.getByRole("heading", { name: "Serviços" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(name)).toBeVisible({ timeout: 15_000 });
}

export async function createTemplateUi(page: Page, name: string) {
  await page.goto("/app/cycle-templates/new");
  await page.getByLabel("Nome", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Salvar modelo" }).click();
  await expect(page.getByText(name)).toBeVisible({ timeout: 15_000 });
}

export async function awaitAppReady(page: Page) {
  await expect(page.getByText("Verificando assinatura…")).toHaveCount(0, {
    timeout: 30_000,
  });
}

export async function confirmIntelligentCycle(
  page: Page,
  opts: {
    client: string;
    service: string;
    template: string;
    startsOn: string;
    days: string[];
    discount?: string;
  },
) {
  await page.goto("/app/cycles/new");
  await awaitAppReady(page);
  await expect(page.getByRole("heading", { name: /Novo ciclo/i })).toBeVisible({
    timeout: 15_000,
  });
  const clientBox = page.getByRole("combobox", { name: "Cliente", exact: true });
  await expect(clientBox.getByRole("option", { name: opts.client })).toHaveCount(1, { timeout: 15_000 });
  await clientBox.selectOption({ label: opts.client });
  const serviceBox = page.getByRole("combobox", { name: "Serviço", exact: true });
  const serviceValue = await serviceBox
    .locator("option")
    .filter({ hasText: opts.service })
    .first()
    .getAttribute("value");
  expect(serviceValue).toBeTruthy();
  await serviceBox.selectOption(serviceValue!);
  await page.getByRole("combobox", { name: "Modelo de ciclo", exact: true }).selectOption({ label: opts.template });
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Data de início do ciclo").fill(opts.startsOn);
  for (const day of opts.days) {
    await page.getByRole("button", { name: day, exact: true }).click();
  }
  await page.getByRole("button", { name: "Calcular aulas" }).click();
  await expect(page.getByText(/Vigência/)).toBeVisible({ timeout: 15_000 });
  if (opts.discount) {
    await page.getByLabel(/Desconto/).fill(opts.discount);
    await page.getByRole("button", { name: "Recalcular ciclo e valores" }).click();
    await expect(page.getByText(/Vigência/)).toBeVisible({ timeout: 15_000 });
  }
  await page.getByRole("button", { name: "Confirmar ciclo" }).click();
  await expect(page.getByRole("heading", { name: opts.client })).toBeVisible({ timeout: 15_000 });
}

export async function seedIntelligentCycleApi(
  page: Page,
  opts: { clientName: string; startsOn?: string },
) {
  const clientRes = await page.request.post("/api/v1/clients", {
    data: { full_name: opts.clientName, phone: "11988887777" },
  });
  expect(clientRes.ok(), await clientRes.text()).toBeTruthy();
  const clientId = (await clientRes.json()).id as string;
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
  ).id as string;
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
  ).id as string;
  const cycle = await page.request.post("/api/v1/cycles/intelligent", {
    data: {
      client_id: clientId,
      service_id: serviceId,
      cycle_template_id: templateId,
      starts_on: opts.startsOn ?? "2026-08-01",
      weekdays: [1, 3],
      starts_time: "09:00:00",
      generate_appointments: true,
      create_receivable: true,
      idempotency_key: `e2e-${Date.now()}`,
    },
  });
  expect(cycle.ok(), await cycle.text()).toBeTruthy();
  return { clientId, cycle: await cycle.json() };
}

export function nav(page: Page, name: "Hoje" | "Agenda" | "Clientes" | "Ciclos" | "Mais") {
  return page.getByRole("navigation").getByRole("link", { name, exact: true });
}

export async function logoutUi(page: Page) {
  await page.getByRole("button", { name: "Abrir menu da conta" }).click();
  await page.getByRole("menuitem", { name: "Sair" }).click();
  await expect(page.getByRole("heading", { name: "Entrar", exact: true })).toBeVisible({
    timeout: 15_000,
  });
}

export async function loginUi(page: Page, email: string) {
  await page.getByRole("textbox", { name: "E-mail" }).fill(email);
  await page.getByRole("textbox", { name: "Senha" }).fill(DEFAULT_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: /Hoje|Bom |Boa / })).toBeVisible({
    timeout: 20_000,
  });
}
