import { expect, test, type Page } from "@playwright/test";

// Local UI fixtures only. No requests or mutations against HML/production.
const overview = {
  organizations_total: 128, professionals_total: 146, registrations_last_24_hours: 4,
  registrations_last_7_days: 18, organizations_active: 94, organizations_evaluating: 28,
  organizations_suspended: 6, organizations_in_trial: 28, trials_ending_soon: 5,
  subscriptions_active: 94, subscriptions_past_due_or_expired: 3, subscriptions_suspended_or_blocked: 2,
  clients_active_total: 2380, cycles_total: 1742, appointments_scheduled_total: 8650,
  receivables_total: 2164, assistant_threads_total: 346, ai_proposals_generated: 208,
  ai_proposals_confirmed: 182, ai_failures_recent: 0, feedbacks_new: 7,
  errors_recent: 0, cycle_agenda_critical: 1, cycle_agenda_divergent: 0,
  environment: "test", generated_at: "2026-09-04T18:30:00Z",
};
const organization = {
  id: "org-demo", name: "[DEMO-CRONIU] Studio Movimento", status: "active", plan_code: "trial",
  owner_name: "Marina Costa", owner_email_masked: "m***@example.com", subscription_status: "trial",
  created_at: "2026-08-12T12:00:00Z", last_activity_at: null, last_login_at: "2026-09-04T12:20:00Z",
  clients_count: 32, cycles_count: 28, appointments_count: 146, assistant_threads_count: 12,
  timezone: "America/Sao_Paulo", trial_ends_at: "2026-09-10T12:00:00Z", profession_label: "Personal trainer",
  profession_onboarding_done: true, plans_count: 3, published_plans_count: 2, overdue_occurrences_count: 0,
};

async function mockPlatform(page: Page, role = "platform_admin") {
  const requests: { path: string; method: string; body: unknown }[] = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    requests.push({ path: url.pathname + url.search, method: request.method(), body: request.postDataJSON() });
    let data: unknown;
    if (path.endsWith("/auth/me")) data = { id: "demo-admin", full_name: "Operador DEMO", email: "demo@example.com", role, environment: "test" };
    else if (path.endsWith("/overview")) data = overview;
    else if (path.endsWith("/deletion-preview")) data = { organization_id: organization.id, organization_name: organization.name, eligible_for_hard_delete: true, will_anonymize: false, blocking_reasons: [], data_to_remove: { clients: 32, cycles: 28 } };
    else if (path.endsWith("/timeline")) data = { organization_id: organization.id, organization_name: organization.name, events: [{ kind: "organization_created", label: "Organização cadastrada", occurred_at: organization.created_at }] };
    else if (path.endsWith("/deactivate")) data = { ...organization, status: "disabled" };
    else if (path.endsWith("/trial/extend")) data = { organization_id: organization.id, previous_trial_ends_at: organization.trial_ends_at, previous_trial_ends_at_local: organization.trial_ends_at, new_trial_ends_at: "2026-09-17T12:00:00Z", new_trial_ends_at_local: "2026-09-17T12:00:00Z", additional_days: 7 };
    else if (path.endsWith(`/organizations/${organization.id}`)) data = organization;
    else if (path.endsWith("/organizations")) {
      const pageNumber = Number(url.searchParams.get("page") ?? 1);
      const size = Number(url.searchParams.get("page_size") ?? 20);
      const query = url.searchParams.get("search");
      const items = query === "inexistente" ? [] : query ? [organization] : [organization, ...["Clínica Equilíbrio", "Núcleo Performance", "Espaço Bem Viver", "Estúdio Conexão"].map((name, i) => ({ ...organization, id: `org-demo-${i}`, name: `[DEMO-CRONIU] ${name}`, owner_name: ["Lucas Alves", "Fernanda Lima", "Rafael Souza", "Beatriz Santos"][i], subscription_status: i === 2 ? "expired" : "active", clients_count: 18 + i * 12 }))];
      data = { items, total: query === "inexistente" ? 0 : query ? 1 : 128, page: pageNumber, page_size: size };
    } else if (path.endsWith("/users")) data = { items: [{ id: "u-demo", full_name: "[DEMO-CRONIU] Marina Costa", email_masked: "m***@example.com", account_status: "active", email_verified: true, created_at: organization.created_at, last_login_at: organization.last_login_at, organization_id: organization.id, organization_name: organization.name, organization_role: "owner", platform_roles: [] }], total: 1, page: 1, page_size: 20 };
    else if (path.endsWith("/ai-ops")) data = { configured: false };
    else if (path.endsWith("/cycle-agenda-integrity")) data = { items: [], total: 0, summary: {}, page: 1, page_size: 20 };
    else data = { items: [], total: 0, page: 1, page_size: 30 };
    await route.fulfill({ json: data });
  });
  return requests;
}

test.beforeEach(async ({ baseURL }) => {
  expect(new URL(baseURL!).hostname).toMatch(/^(127\.0\.0\.1|localhost)$/);
});

test("desktop: overview, priorities and URL search/pagination", async ({ page }) => {
  await mockPlatform(page);
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Precisa de atenção" })).toBeVisible();
  await expect(page.getByText("128", { exact: true })).toBeVisible();
  await page.screenshot({ path: "e2e/artifacts/admin-control-premium/dashboard-desktop.png", fullPage: true });
  await page.keyboard.press("/");
  await expect(page.getByRole("searchbox", { name: "Buscar organização" })).toBeFocused();
  await page.getByRole("searchbox", { name: "Buscar organização" }).fill("Studio");
  await page.getByRole("searchbox", { name: "Buscar organização" }).press("Enter");
  await expect(page).toHaveURL(/organizations\?search=Studio/);
  await expect(page.getByRole("link", { name: "Gerenciar " + organization.name })).toBeVisible();
  await page.getByRole("button", { name: "Limpar busca" }).click();
  await expect(page.getByText("128", { exact: true })).toBeVisible();
  await page.screenshot({ path: "e2e/artifacts/admin-control-premium/organizations-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Próxima" }).click();
  await expect(page).toHaveURL(/page=2/);
  await page.reload();
  await expect(page.getByText("Página 2 de 7")).toBeVisible();
  await page.getByLabel("Registros por página").selectOption("50");
  await expect(page).toHaveURL(/size=50/);
  await expect(page.getByText("Página 1 de 3")).toBeVisible();
});

test("mobile: drawer traps focus, restores focus and cards fit viewport", async ({ page }) => {
  await mockPlatform(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");
  await expect(page.getByText("128", { exact: true })).toBeVisible();
  await page.screenshot({ path: "e2e/artifacts/admin-control-premium/dashboard-mobile.png", fullPage: true });
  const trigger = page.getByRole("button", { name: "Abrir navegação" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Navegação" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Fechar navegação" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Sair", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog.getByRole("link", { name: "Organizações" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("link", { name: "Gerenciar " + organization.name })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "e2e/artifacts/admin-control-premium/organizations-mobile.png", fullPage: true });
});

test("network error can be retried; empty searches are honest", async ({ page }) => {
  await mockPlatform(page);
  let failed = true;
  await page.route("**/api/v1/platform/overview", (route) => failed ? route.abort("failed") : route.fulfill({ json: overview }));
  await page.goto("/dashboard");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("conectar ao servidor");
  failed = false;
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(page.getByText("128", { exact: true })).toBeVisible();
  await page.goto("/organizations?search=inexistente");
  await expect(page.getByRole("heading", { name: "Nenhuma organização encontrada" })).toBeVisible();
  await page.getByRole("button", { name: "Limpar busca" }).click();
  await expect(page.getByText("128", { exact: true })).toBeVisible();
});

test("unknown indicators are not shown as healthy zeroes", async ({ page }) => {
  await mockPlatform(page);
  await page.route("**/api/v1/platform/overview", (route) => route.fulfill({ json: { ...overview, errors_recent: null, trials_ending_soon: null, subscriptions_active: null } }));
  await page.goto("/dashboard");
  await expect(page.getByText(/Indicadores indisponíveis:/)).toContainText("Erros recentes");
  await expect(page.getByText("Indisponível", { exact: true }).first()).toBeVisible();
});

test("account actions require confirmation; cancel never mutates", async ({ page }) => {
  const requests = await mockPlatform(page);
  await page.goto(`/organizations/${organization.id}`);
  await expect(page.getByRole("heading", { name: organization.name })).toBeVisible();
  await page.screenshot({ path: "e2e/artifacts/admin-control-premium/organization-detail.png", fullPage: true });
  const trial = page.locator("#teste");
  await trial.getByLabel("Motivo administrativo", { exact: true }).fill("Pedido do titular de demonstração");
  await trial.getByRole("button", { name: "Estender teste", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Confirmar extensão de teste" })).toBeVisible();
  expect(requests.filter((r) => r.method === "POST")).toHaveLength(0);
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await trial.getByRole("button", { name: "Estender teste", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar extensão", exact: true }).click();
  await expect(page.getByText(/Teste estendido com sucesso/)).toBeVisible();
  expect(requests.filter((r) => r.method === "POST")).toHaveLength(1);
  await page.getByRole("button", { name: "Ver o que será removido" }).click();
  const deletion = page.getByRole("heading", { name: "Excluir permanentemente", exact: true }).locator("..");
  await expect(deletion.getByRole("button", { name: "Excluir permanentemente", exact: true })).toBeDisabled();
  await deletion.getByLabel(/Digite o nome da organização/).fill(organization.name);
  await deletion.getByLabel("Motivo administrativo da exclusão").fill("Demonstração de cancelamento");
  await deletion.getByRole("checkbox").check();
  await deletion.getByRole("button", { name: "Excluir permanentemente", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Confirmar exclusão permanente" })).toBeVisible();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  expect(requests.some((r) => r.path.endsWith("/permanent-delete"))).toBe(false);
});

test("viewer can inspect account but cannot open mutation forms", async ({ page }) => {
  const requests = await mockPlatform(page, "platform_viewer");
  await page.goto(`/organizations/${organization.id}`);
  await expect(page.getByRole("heading", { name: organization.name })).toBeVisible();
  await expect(page.getByRole("button", { name: "Estender teste", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Desativar conta", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ver o que será removido" })).toHaveCount(0);
  expect(requests.filter((r) => r.method === "POST")).toHaveLength(0);
});

test("all existing console areas remain accessible", async ({ page }) => {
  await mockPlatform(page);
  for (const [path, title] of [["/users", "Usuários"], ["/referrals", "Parceiros e indicações"], ["/feedbacks", "Feedbacks"], ["/cycle-agenda", "Integridade ciclo–agenda"], ["/ai", "Assistente IA"], ["/errors", "Erros (sanitizados)"]]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: title, exact: true }).first()).toBeVisible();
  }
});
