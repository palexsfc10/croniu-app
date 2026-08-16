import { expect, test } from "@playwright/test";
import { apiRegister } from "./helpers";

const PROFILES = [
  { code: "personal_trainer", template: "Revisar plano", label: /aluno/i },
  { code: "private_tutor", template: "Preparar aula", label: /aluno/i },
  { code: "aesthetics", template: "Confirmar atendimento", label: /cliente/i },
  { code: "physiotherapist", template: "Confirmar sessão", label: /paciente|cliente/i },
  { code: "nutritionist", template: "Confirmar consulta", label: /paciente|cliente/i },
  { code: "other", template: "Entrar em contato", label: /cliente/i },
] as const;

for (const profile of PROFILES) {
  test(`profession ${profile.code} templates and primary nav`, async ({ page }) => {
    const suffix = Date.now().toString().slice(-6);
    await apiRegister(page, {
      name: `Pro ${profile.code}`,
      org: `Studio ${profile.code} ${suffix}`,
      email: `${profile.code}_${suffix}@example.com`,
      profession: profile.code,
    });
    await expect(page.getByRole("link", { name: "Rotinas" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Ciclos" })).toHaveCount(0);
    await page.goto("/app/routines");
    await expect(page.getByRole("heading", { name: "Sugestões para você" })).toBeVisible();
    await expect(page.getByText(profile.template, { exact: true }).first()).toBeVisible();
    await page.getByRole("switch", { name: `Ativar ${profile.template}` }).click();
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page.getByRole("switch", { name: `Ativar ${profile.template}` })).toBeDisabled();
    await expect(page.getByText("Ativa").first()).toBeVisible();
    await page.goto("/app/profile");
    await expect(page.getByRole("link", { name: /Ciclos e renovações/i })).toBeVisible();
    await page.getByRole("link", { name: /Ciclos e renovações/i }).click();
    await expect(page.getByRole("heading", { name: "Renovações" })).toBeVisible();
    await expect(page.getByText(/Filtro ativo/)).toBeVisible();
  });
}
