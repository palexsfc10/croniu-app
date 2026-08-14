import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

const artifacts = path.join("e2e", "artifacts", "isolation-consistency");
const password = "SenhaForte1!";

async function apiRegister(
  page: Page,
  opts: { name: string; org: string; email: string },
) {
  const res = await page.request.post("/api/v1/auth/register", {
    data: {
      full_name: opts.name,
      organization_name: opts.org,
      email: opts.email,
      password,
      profession_code: "consultant",
    },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  await expect
    .poll(async () =>
      (await page.context().cookies()).some((c) => c.name === "croniu_session"),
    )
    .toBeTruthy();
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: /Hoje|Bom |Boa / })).toBeVisible({
    timeout: 30_000,
  });
}

async function logout(page: Page) {
  await page.request.post("/api/v1/auth/logout");
  await page.goto("/login");
  await expect(page).toHaveURL(/\/login/);
}

test.describe("isolation, agenda, register and ficha", () => {
  test("login from both register steps authenticates and reaches app", async ({ page }) => {
    const email = `login_steps_${Date.now()}@example.com`;
    const password = "SenhaForte1!";
    await apiRegister(page, {
      name: "Conta Pronta",
      org: "Studio Login",
      email,
    });
    await logout(page);

    await page.goto("/register");
    const step1 = page.getByRole("link", { name: "Entrar" });
    await expect(step1).toBeVisible();
    const box1 = await step1.boundingBox();
    const continueBox = await page.getByRole("button", { name: "Continuar" }).boundingBox();
    expect(box1 && continueBox).toBeTruthy();
    const overlap =
      box1!.x < continueBox!.x + continueBox!.width &&
      box1!.x + box1!.width > continueBox!.x &&
      box1!.y < continueBox!.y + continueBox!.height &&
      box1!.y + box1!.height > continueBox!.y;
    expect(overlap).toBe(false);
    await step1.click();
    await expect(page).toHaveURL(/\/login/);

    await page.goto("/register");
    await page.getByLabel("Seu nome").fill("Outro");
    await page.getByLabel(/Nome do negócio/).fill("Studio Outro");
    await page.getByLabel("E-mail").fill(`other_${Date.now()}@example.com`);
    await page.getByLabel("Senha").fill("SenhaForte1!");
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(page.getByText(/Etapa 2 de 2/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Criar minha conta" })).toBeVisible();
    const registerPosts: string[] = [];
    page.on("request", (req) => {
      if (req.method() === "POST" && req.url().includes("/auth/register")) {
        registerPosts.push(req.url());
      }
    });
    await page.getByRole("link", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/login/);
    expect(registerPosts).toEqual([]);

    await expect(page.getByRole("heading", { name: "Entrar", exact: true })).toBeVisible();
    await page.getByRole("textbox", { name: "E-mail" }).fill(email);
    await expect(page.getByRole("textbox", { name: "E-mail" })).toHaveValue(email);
    await page.getByRole("textbox", { name: "Senha" }).fill(password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/app/, { timeout: 30_000 });
    const cookies = await page.context().cookies();
    expect(cookies.some((c) => c.name.includes("session") || c.name.includes("croniu"))).toBeTruthy();

    await page.goto("/register");
    await page.getByRole("link", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/(login|app)/, { timeout: 15_000 });
    if (/\/login/.test(page.url())) {
      await expect(page).toHaveURL(/\/app/, { timeout: 15_000 });
    }

    await page.goBack();
    await page.goto("/app");
    await expect(page.getByRole("heading", { name: /Hoje|Bom |Boa / })).toBeVisible();
  });

  test("ficha CTAs, cycle lessons and next agenda date", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await apiRegister(page, {
      name: "Pro Isolation",
      org: "Studio Isolation",
      email: `iso_${Date.now()}@example.com`,
    });

    const muriloRes = await page.request.post("/api/v1/clients", {
      data: { full_name: "Murilo Macedo", phone: "11911112222" },
    });
    expect(muriloRes.ok()).toBeTruthy();
    const murilo = await muriloRes.json();
    const anaRes = await page.request.post("/api/v1/clients", {
      data: { full_name: "Ana Souza", phone: "11933334444" },
    });
    expect(anaRes.ok()).toBeTruthy();
    const ana = await anaRes.json();
    await page.goto(`/app/clients/${ana.id}?tab=acompanhamento`);
    await expect(page.getByRole("heading", { name: /Ana Souza/i })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Criar ciclo" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Criar plano" })).toBeVisible();
    await page.goto(`/app/clients/${murilo.id}?tab=acompanhamento`);
    await expect(page.getByRole("heading", { name: /Murilo Macedo/i })).toBeVisible();
    await expect(page.getByText("Ana Souza")).toHaveCount(0);

    await page.screenshot({ path: path.join(artifacts, "ficha-390.png"), fullPage: true });
    await page.setViewportSize({ width: 360, height: 800 });
    await page.screenshot({ path: path.join(artifacts, "ficha-360.png"), fullPage: true });
    await page.setViewportSize({ width: 412, height: 915 });
    await page.screenshot({ path: path.join(artifacts, "ficha-412.png"), fullPage: true });

    const services = await page.request.post("/api/v1/services", {
      data: {
        name: "Aula padrão",
        default_duration_minutes: 60,
        default_duration_days: 30,
        default_price_cents: 9000,
      },
    });
    const templates = await page.request.post("/api/v1/cycle-templates", {
      data: {
        name: "3x semana",
        weekly_frequency: 3,
        duration_type: "calendar_months",
        duration_value: 1,
      },
    });
    const cycle = await page.request.post("/api/v1/cycles/intelligent", {
      data: {
        client_id: murilo.id,
        service_id: (await services.json()).id,
        cycle_template_id: (await templates.json()).id,
        starts_on: "2026-08-17",
        weekdays: [0, 2, 4],
        starts_time: "14:00:00",
        generate_appointments: true,
        create_receivable: true,
        idempotency_key: `e2e-cycle-${Date.now()}`,
      },
    });
    expect(cycle.ok()).toBeTruthy();
    const created = await cycle.json();
    const empty = await page.request.get("/api/v1/agenda/day?day=2026-08-14");
    expect((await empty.json()).appointments).toEqual([]);
    const nxt = await page.request.get("/api/v1/agenda/next?after=2026-08-14");
    const nextBody = await nxt.json();
    expect(nextBody.date).toBeTruthy();

    await page.goto(`/app/agenda?day=2026-08-14`);
    await expect(page.getByText(/Nenhuma aula em 14 ago/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Próxima aula:/i)).toBeVisible();
    await page.getByRole("link", { name: "Ver próxima aula" }).click();
    await expect(page).toHaveURL(new RegExp(`/app/agenda\\?day=${nextBody.date}`));
    await expect(page.getByText("Murilo Macedo").first()).toBeVisible();
    await page.screenshot({ path: path.join(artifacts, "agenda-next-lesson.png"), fullPage: true });

    const filled = await page.request.get(`/api/v1/agenda/day?day=${nextBody.date}`);
    const day = await filled.json();
    expect(day.appointments.some((a: { cycle_id: string }) => a.cycle_id === created.id)).toBeTruthy();
  });

  test("two tenants cannot read each other clients after logout", async ({ page, request, baseURL }) => {
    await apiRegister(page, {
      name: "Pro A",
      org: "Org A",
      email: `tenA_${Date.now()}@example.com`,
    });
    const createdA = await page.request.post("/api/v1/clients", {
      data: { full_name: "Somente A", phone: "11900000001" },
    });
    expect(createdA.ok()).toBeTruthy();
    const clientId = (await createdA.json()).id;
    await logout(page);

    await apiRegister(page, {
      name: "Pro B",
      org: "Org B",
      email: `tenB_${Date.now()}@example.com`,
    });
    await expect(page.getByText("Somente A")).toHaveCount(0);
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const res = await request.get(`${baseURL}/api/v1/clients/${clientId}`, {
      headers: { Cookie: cookieHeader },
    });
    expect(res.status()).toBe(404);
    const home = await request.get(`${baseURL}/api/v1/home/summary`, {
      headers: { Cookie: cookieHeader },
    });
    expect(home.ok()).toBeTruthy();
    const summary = await home.json();
    const names = JSON.stringify(summary);
    expect(names).not.toContain("Somente A");
  });
});
