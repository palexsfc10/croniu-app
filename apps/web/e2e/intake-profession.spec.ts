import { expect, test, type Page } from "@playwright/test";
import { apiRegister } from "./helpers";

const FORBIDDEN_HEALTH = [/lesão/i, /condição cardiovascular/i, /avaliação médica/i];

const MATRIX = [
  {
    code: "personal_trainer" as const,
    title: /Anamnese de atividade física/i,
    allowHealth: true,
  },
  {
    code: "private_tutor" as const,
    title: /Cadastro inicial do aluno/i,
    allowHealth: false,
    required: [/objetivo de aprendizagem/i, /Matéria ou modalidade/i],
  },
  {
    code: "aesthetics" as const,
    title: /Ficha inicial de atendimento/i,
    allowHealth: true,
  },
  {
    code: "physiotherapist" as const,
    title: /Ficha inicial de fisioterapia/i,
    allowHealth: true,
  },
  {
    code: "nutritionist" as const,
    title: /Ficha inicial de acompanhamento nutricional/i,
    allowHealth: true,
  },
  {
    code: "other" as const,
    title: /Cadastro inicial/i,
    allowHealth: false,
  },
];

async function createInvite(page: Page) {
  const res = await page.request.post("/api/v1/intake-link", { data: {} });
  expect(res.ok(), await res.text()).toBeTruthy();
  const body = (await res.json()) as { token: string };
  expect(body.token).toBeTruthy();
  return body.token;
}

for (const profile of MATRIX) {
  test(`intake form for ${profile.code}`, async ({ page, browser }) => {
    const suffix = Date.now().toString().slice(-6);
    await apiRegister(page, {
      name: `Pro ${profile.code}`,
      org: `Studio ${profile.code} ${suffix}`,
      email: `${profile.code}_intake_${suffix}@example.com`,
      profession: profile.code,
    });
    const token = await createInvite(page);
    const anon = await browser.newContext();
    const guest = await anon.newPage();
    await guest.setViewportSize({ width: 390, height: 844 });
    await guest.goto(`/entrar/${token}`);
    const formHeading = guest.getByRole("heading", { level: 1, name: profile.title });
    await expect(formHeading).toBeVisible({ timeout: 15_000 });
    await guest.getByRole("button", { name: /Começar/i }).click();
    await guest.getByLabel(/Nome/i).fill("Aluno Teste");
    await guest.getByLabel(/Telefone/i).fill("11988887777");
    await guest.getByLabel(/objetivo/i).first().fill("Reforço em matemática");
    await guest.getByRole("checkbox", { name: /18 anos/i }).check();
    await guest.getByRole("button", { name: /Continuar/i }).click();
    await expect(formHeading).toBeVisible();
    if (!profile.allowHealth) {
      for (const rx of FORBIDDEN_HEALTH) {
        await expect(guest.getByText(rx)).toHaveCount(0);
      }
    }
    if (profile.required) {
      for (const rx of profile.required) {
        await expect(guest.getByText(rx).first()).toBeVisible();
      }
    }
    await anon.close();
  });
}

test("tutor cannot pin physical anamnesis", async ({ page }) => {
  const suffix = Date.now().toString().slice(-6);
  await apiRegister(page, {
    name: "Pro Tutor Neg",
    org: `Studio Tutor Neg ${suffix}`,
    email: `tutor_neg_${suffix}@example.com`,
    profession: "private_tutor",
  });
  const res = await page.request.post("/api/v1/intake-link", {
    data: { form_kind: "physical_anamnesis" },
  });
  expect(res.status()).toBe(422);
  const body = await res.json();
  expect(body.code).toBe("incompatible_form_kind");
});

test("logout does not reuse previous org template", async ({ page }) => {
  const suffix = Date.now().toString().slice(-6);
  await apiRegister(page, {
    name: "Pro PT Cache",
    org: `Studio PT ${suffix}`,
    email: `pt_cache_${suffix}@example.com`,
    profession: "personal_trainer",
  });
  const ptToken = await createInvite(page);
  await page.request.post("/api/v1/auth/logout");
  await apiRegister(page, {
    name: "Pro Tutor Cache",
    org: `Studio Tutor ${suffix}`,
    email: `tutor_cache_${suffix}@example.com`,
    profession: "private_tutor",
  });
  const tutorToken = await createInvite(page);
  expect(tutorToken).not.toBe(ptToken);
  const ctx = await page.request.get(`/api/v1/public/intake/${tutorToken}`);
  const body = await ctx.json();
  expect(String(body.form_name)).toMatch(/Cadastro inicial do aluno/i);
  expect(String(body.form_name)).not.toMatch(/Anamnese/i);
});
