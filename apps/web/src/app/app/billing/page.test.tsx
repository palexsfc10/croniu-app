import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import BillingPage from "@/app/app/billing/page";
import type { BillingEntitlement } from "@/lib/billing";

const apiFetch = vi.fn();

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/components/app/back-link", () => ({
  BackLink: () => <a href="/app/profile">Mais</a>,
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    apiFetch: (...args: unknown[]) => apiFetch(...args),
  };
});

function baseEnt(overrides: Partial<BillingEntitlement>): BillingEntitlement {
  return {
    subscription_status: "trial",
    payment_status: "none",
    billing_setup_status: "available",
    has_active_access: true,
    can_write: true,
    trial_days_remaining: 5,
    trial_ends_at: "2026-08-25T12:00:00Z",
    checkout_available: true,
    card_enabled: true,
    can_start_checkout: true,
    can_resume_checkout: false,
    recommended_action: "subscribe",
    amount_cents: 2990,
    ...overrides,
  };
}

async function renderWithEnt(ent: BillingEntitlement) {
  apiFetch.mockResolvedValueOnce({ data: ent, status: 200 });
  render(<BillingPage />);
  await waitFor(() => expect(screen.queryByText("Carregando assinatura…")).not.toBeInTheDocument());
}

describe("/app/billing — máquina de estados", () => {
  afterEach(() => {
    cleanup();
    apiFetch.mockReset();
  });

  it("trial ativo com checkout liberado: mostra botão de assinar e nunca repete o texto de status", async () => {
    await renderWithEnt(baseEnt({}));
    expect(screen.getByText("Teste grátis ativo")).toBeInTheDocument();
    // Regression guard: the old bug rendered "Teste grátis ativo" twice.
    expect(screen.getAllByText("Teste grátis ativo")).toHaveLength(1);
    expect(screen.getByText(/primeira cobrança/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Assinar por/ })).toBeInTheDocument();
  });

  it("trial ativo sem checkout liberado neste ambiente: explica em vez de ficar em silêncio", async () => {
    await renderWithEnt(
      baseEnt({ checkout_available: false, can_start_checkout: false, card_enabled: true }),
    );
    expect(screen.getByText("Teste grátis ativo")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Assinar por/ })).not.toBeInTheDocument();
    expect(
      screen.getByText(/ainda não está disponível para esta conta/i),
    ).toBeInTheDocument();
  });

  it("trial expirado: pede assinatura", async () => {
    await renderWithEnt(
      baseEnt({
        subscription_status: "expired",
        blocking_reason: "trial_expired",
        trial_days_remaining: 0,
      }),
    );
    expect(screen.getByText("Teste encerrado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Assinar por/ })).toBeInTheDocument();
  });

  it("checkout pendente: oferece continuar em vez de recomeçar", async () => {
    await renderWithEnt(
      baseEnt({
        billing_setup_status: "checkout_pending",
        can_start_checkout: false,
        can_resume_checkout: true,
        resume_checkout_url: "https://sandbox.asaas.com/checkoutSession/show/abc",
        open_checkout_expires_at: "2026-08-19T12:00:00Z",
      }),
    );
    expect(screen.getByText("Checkout em andamento")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continuar checkout" })).toHaveAttribute(
      "href",
      "https://sandbox.asaas.com/checkoutSession/show/abc",
    );
  });

  it("pagamento confirmado (subscription_prepared): explica a data da primeira cobrança real", async () => {
    await renderWithEnt(
      baseEnt({
        billing_setup_status: "subscription_prepared",
        can_start_checkout: false,
        recommended_action: "await_first_charge",
      }),
    );
    expect(screen.getByText("Assinatura confirmada")).toBeInTheDocument();
    expect(screen.getByText(/não cobramos antes do fim do teste/i)).toBeInTheDocument();
  });

  it("assinatura ativa: mostra a próxima cobrança, sem botão de assinar", async () => {
    await renderWithEnt(
      baseEnt({
        subscription_status: "active",
        billing_setup_status: "paid",
        payment_status: "confirmed",
        can_start_checkout: false,
        recommended_action: null,
        next_billing_at: "2026-09-18T12:00:00Z",
      }),
    );
    expect(screen.getByText("Assinatura ativa")).toBeInTheDocument();
    expect(screen.getByText(/Próxima cobrança em 18\/09\/2026/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Assinar por/ })).not.toBeInTheDocument();
  });

  it("inadimplente: mostra prazo de regularização e não inventa um botão", async () => {
    await renderWithEnt(
      baseEnt({
        subscription_status: "past_due",
        can_start_checkout: false,
        recommended_action: "update_payment_method",
        grace_period_ends_at: "2026-08-21T12:00:00Z",
      }),
    );
    expect(screen.getByText("Pagamento em atraso")).toBeInTheDocument();
    expect(screen.getByText(/21\/08\/2026/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Assinar por/ })).not.toBeInTheDocument();
  });

  it("cancelada com acesso agendado: informa até quando o acesso continua", async () => {
    await renderWithEnt(
      baseEnt({
        subscription_status: "cancelled",
        can_start_checkout: false,
        recommended_action: null,
        cancellation_effective_at: "2026-09-01T12:00:00Z",
      }),
    );
    expect(screen.getByText("Assinatura cancelada")).toBeInTheDocument();
    expect(screen.getByText(/01\/09\/2026/)).toBeInTheDocument();
  });

  it("reativação: conta indicada volta a mostrar o preço com desconto normalmente", async () => {
    await renderWithEnt(
      baseEnt({
        subscription_status: "trial",
        amount_cents: 2691,
        referral_active: true,
        referral_discount_percent: 10,
        referral_base_amount_cents: 2990,
      }),
    );
    expect(screen.getByText("Desconto vitalício de indicação")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Assinar por R\$\s?26,91/ })).toBeInTheDocument();
  });
});
