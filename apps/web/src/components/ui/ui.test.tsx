import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { TodayBoard } from "@/components/app/today-board";
import type { HomeSummary } from "@/lib/api";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    loading: false,
    me: {
      user: { id: "1", email: "a@b.com", full_name: "Ana Pro", created_at: "" },
      organization: { id: "1", name: "Studio", timezone: "America/Sao_Paulo" },
      role: "owner",
    },
    logout: vi.fn(),
  }),
}));

const emptySummary: HomeSummary = {
  organization_id: "00000000-0000-0000-0000-000000000001",
  timezone: "America/Sao_Paulo",
  local_today: "2026-07-24",
  today_appointments: [],
  cycles_nearing_end: [],
  renewals: [],
  pending_payments: [],
  priority_action: null,
  contextual_hint: null,
  message: "Nenhuma ação pendente ainda.",
};

describe("UI fundamentals", () => {
  afterEach(() => cleanup());

  it("renders empty state", () => {
    render(<EmptyState title="Atendimentos de hoje" description="Sem itens." />);
    expect(screen.getByText("Atendimentos de hoje")).toBeInTheDocument();
    expect(screen.getByText("Sem itens.")).toBeInTheDocument();
  });

  it("renders button with accessible name", () => {
    render(<Button>Entrar</Button>);
    expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument();
  });

  it("associates label with input", () => {
    render(<TextField label="E-mail" name="email" />);
    expect(screen.getByLabelText("E-mail")).toBeInTheDocument();
  });

  it("shows today board sections and priority action", () => {
    render(
      <TodayBoard
        summary={{
          ...emptySummary,
          contextual_hint: "1 ciclo(s) encerrando",
          priority_action: {
            kind: "cycle_nearing_end",
            title: "Conversar com Ana",
            subtitle: "Ciclo encerra em 2026-07-28",
            href: "/app/cycles/abc",
            entity_id: "abc",
          },
          cycles_nearing_end: [
            {
              id: "abc",
              client_id: "c1",
              service_id: "s1",
              cycle_type: "period",
              status: "active",
              starts_on: "2026-07-01",
              ends_on: "2026-07-28",
              value_cents: 40000,
              notes: null,
              last_contacted_at: null,
              contact_confirmed_at: null,
              created_at: "",
              updated_at: "",
              client_name: "Ana",
              service_name: "Mensal",
              days_remaining: 4,
              is_nearing_end: true,
            },
          ],
        }}
      />,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /Bom dia, Ana|Boa tarde, Ana|Boa noite, Ana/,
    );
    expect(screen.getByText(/\d{2}\/\d{2}\/\d{4}\s·\s\d{2}:\d{2}/)).toBeInTheDocument();
    expect(screen.getAllByText("Conversar com Ana").length).toBeGreaterThan(0);
    expect(screen.getByText("1 ciclo(s) encerrando")).toBeInTheDocument();
  });
});
