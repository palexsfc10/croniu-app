import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({
  query: "",
  replace: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: nav.push, refresh: nav.refresh }),
  useSearchParams: () => new URLSearchParams(nav.query),
}));

const authRefresh = vi.fn(async () => {});

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ me: null, refresh: authRefresh }),
}));

type Profile = {
  profession_code: string | null;
  profession_specialty: string | null;
  profession_other: string | null;
  use_cases: string[] | null;
  profession_onboarding_done: boolean;
};

let profile: Profile;
let contact: { contact_whatsapp_e164: string | null; whatsapp_marketing_consent_at: string | null };
const patchProfessionCalls: Array<Record<string, unknown>> = [];
const patchWhatsappCalls: Array<Record<string, unknown>> = [];

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    apiFetch: vi.fn(async (path: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (path === "/api/v1/auth/me") {
        return {
          data: { user: { full_name: "Ana Silva" }, organization: { name: "Studio Ana" } },
          status: 200,
        };
      }
      if (path === "/api/v1/organization/profession" && method === "GET") {
        return { data: profile, status: 200 };
      }
      if (path === "/api/v1/organization/profession" && method === "PATCH") {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        patchProfessionCalls.push(body);
        profile = {
          profession_code: (body.profession_code as string | null) ?? profile.profession_code,
          profession_specialty:
            (body.profession_specialty as string | null) ?? profile.profession_specialty,
          profession_other: (body.profession_other as string | null) ?? profile.profession_other,
          use_cases: (body.use_cases as string[] | undefined) ?? profile.use_cases,
          profession_onboarding_done: Boolean(body.profession_onboarding_done),
        };
        return { data: profile, status: 200 };
      }
      if (path === "/api/v1/users/me/whatsapp-consent" && method === "GET") {
        return { data: contact, status: 200 };
      }
      if (path === "/api/v1/users/me/whatsapp-consent" && method === "PATCH") {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        patchWhatsappCalls.push(body);
        contact = {
          contact_whatsapp_e164: "5511999990000",
          whatsapp_marketing_consent_at: body.consent_granted ? "2026-09-03T00:00:00Z" : null,
        };
        return { data: contact, status: 200 };
      }
      return { data: null, status: 404 };
    }),
  };
});

import OnboardingWizardPage from "@/app/app/onboarding/page";

describe("Onboarding pós-login — resumível, opcional, sem duplicar organizações", () => {
  beforeEach(() => {
    nav.query = "";
    nav.replace.mockClear();
    nav.push.mockClear();
    nav.refresh.mockClear();
    authRefresh.mockClear();
    patchProfessionCalls.length = 0;
    patchWhatsappCalls.length = 0;
    profile = {
      profession_code: null,
      profession_specialty: null,
      profession_other: null,
      use_cases: null,
      profession_onboarding_done: false,
    };
    contact = { contact_whatsapp_e164: null, whatsapp_marketing_consent_at: null };
  });

  afterEach(() => cleanup());

  it("redirects away immediately when onboarding is already done — never re-forces existing accounts", async () => {
    profile.profession_onboarding_done = true;
    render(<OnboardingWizardPage />);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/app"));
  });

  it("starts on the welcome step and walks through profession, use cases and WhatsApp", async () => {
    render(<OnboardingWizardPage />);
    await screen.findByText(/Bem-vindo, Ana/);
    fireEvent.click(screen.getByRole("button", { name: "Vamos lá" }));

    await screen.findByText("Qual é sua área?");
    fireEvent.click(screen.getByText("Personal trainer"));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    await screen.findByText("O que você quer organizar?");
    expect(patchProfessionCalls[0]).toMatchObject({
      profession_code: "personal_trainer",
      profession_onboarding_done: false,
    });
    fireEvent.click(screen.getByText("Aulas"));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    await screen.findByText("Seu WhatsApp");
    expect(patchProfessionCalls[1]).toMatchObject({
      use_cases: ["classes"],
      profession_onboarding_done: false,
    });
  });

  it("never grants WhatsApp marketing consent without an explicit, unchecked-by-default checkbox", async () => {
    render(<OnboardingWizardPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Vamos lá" }));
    fireEvent.click(screen.getByRole("button", { name: "Pular esta etapa" }));
    fireEvent.click(await screen.findByRole("button", { name: "Pular esta etapa" }));

    await screen.findByText("Seu WhatsApp");
    const consentCheckbox = screen.getByRole("checkbox");
    expect(consentCheckbox).not.toBeChecked();

    fireEvent.change(screen.getByLabelText("WhatsApp"), { target: { value: "11999990000" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(patchWhatsappCalls).toHaveLength(1));
    expect(patchWhatsappCalls[0]).toMatchObject({
      contact_whatsapp_e164: "11999990000",
      consent_granted: null,
    });
  });

  it("grants consent only when the checkbox is explicitly checked", async () => {
    render(<OnboardingWizardPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Vamos lá" }));
    fireEvent.click(screen.getByRole("button", { name: "Pular esta etapa" }));
    fireEvent.click(await screen.findByRole("button", { name: "Pular esta etapa" }));

    await screen.findByText("Seu WhatsApp");
    fireEvent.change(screen.getByLabelText("WhatsApp"), { target: { value: "11999990000" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(patchWhatsappCalls).toHaveLength(1));
    expect(patchWhatsappCalls[0]).toMatchObject({
      contact_whatsapp_e164: "11999990000",
      consent_granted: true,
    });
  });

  it("skips the WhatsApp step entirely without calling the API when left blank", async () => {
    render(<OnboardingWizardPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Vamos lá" }));
    fireEvent.click(screen.getByRole("button", { name: "Pular esta etapa" }));
    fireEvent.click(await screen.findByRole("button", { name: "Pular esta etapa" }));

    await screen.findByText("Seu WhatsApp");
    fireEvent.click(screen.getByRole("button", { name: "Pular esta etapa" }));

    await screen.findByText("Por onde começar?");
    expect(patchWhatsappCalls).toHaveLength(0);
  });

  it("finishing from the last step marks onboarding done and navigates to the chosen first action", async () => {
    render(<OnboardingWizardPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Vamos lá" }));
    fireEvent.click(screen.getByRole("button", { name: "Pular esta etapa" }));
    fireEvent.click(await screen.findByRole("button", { name: "Pular esta etapa" }));
    fireEvent.click(await screen.findByRole("button", { name: "Pular esta etapa" }));

    await screen.findByText("Por onde começar?");
    fireEvent.click(screen.getByText("Cadastrar um cliente"));

    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/app/clients/new"));
    expect(patchProfessionCalls.at(-1)).toMatchObject({ profession_onboarding_done: true });
    expect(authRefresh).toHaveBeenCalled();
  });

  it("'Concluir depois' at any step marks onboarding done immediately and exits — never forces completion", async () => {
    render(<OnboardingWizardPage />);
    await screen.findByText(/Bem-vindo, Ana/);
    fireEvent.click(screen.getByRole("button", { name: "Concluir depois" }));

    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/app"));
    expect(patchProfessionCalls.at(-1)).toMatchObject({ profession_onboarding_done: true });
  });

  it("forwards a safe ?next= to the final destination instead of hardcoding /app", async () => {
    nav.query = "next=%2Fapp%2Fclients";
    render(<OnboardingWizardPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Concluir depois" }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/app/clients"));
  });

  it("pre-fills fields already saved from a previous, interrupted pass — no data loss on resume", async () => {
    profile.profession_code = "personal_trainer";
    profile.use_cases = ["classes"];
    render(<OnboardingWizardPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Vamos lá" }));

    await screen.findByText("Qual é sua área?");
    const desktop = screen.getByText("Personal trainer").closest("label") as HTMLElement;
    expect(within(desktop).getByRole("radio")).toBeChecked();
  });
});
