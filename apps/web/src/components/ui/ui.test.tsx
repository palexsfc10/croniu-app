import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { TodayBoard } from "@/components/app/today-board";
import type { HomeSummary } from "@/lib/api";

const emptySummary: HomeSummary = {
  organization_id: "00000000-0000-0000-0000-000000000001",
  today_appointments: [],
  cycles_nearing_end: [],
  renewals: [],
  pending_payments: [],
  priority_action: null,
  contextual_hint: null,
  message: "Nenhuma ação pendente ainda.",
};

describe("UI fundamentals", () => {
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
    expect(screen.getByRole("heading", { name: "Hoje" })).toBeInTheDocument();
    expect(screen.getByText("Conversar com Ana")).toBeInTheDocument();
    expect(screen.getByText("1 ciclo(s) encerrando")).toBeInTheDocument();
  });
});
