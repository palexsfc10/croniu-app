import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TextField } from "@/components/ui/text-field";
import { TodayBoard } from "@/components/app/today-board";
import type { HomeSummary } from "@/lib/api";
import {
  cycleStatusLabel,
  cycleStatusTone,
  receivableStatusLabel,
  receivableStatusTone,
} from "@/lib/status-tone";

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
  upcoming_appointments: [],
  appointments_needing_outcome: [],
  cycles_nearing_end: [],
  renewals: [],
  pending_payments: [],
  attention_items: [],
  priority_action: null,
  contextual_hint: null,
  message: "Você não possui nenhuma pendência importante neste momento.",
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

  it("applies semantic button variants", () => {
    const { rerender } = render(<Button variant="primary">Salvar</Button>);
    expect(screen.getByRole("button", { name: "Salvar" }).className).toContain("btn-primary");
    rerender(<Button variant="danger">Excluir</Button>);
    expect(screen.getByRole("button", { name: "Excluir" }).className).toContain("btn-danger");
    rerender(<Button variant="ai">Perguntar</Button>);
    expect(screen.getByRole("button", { name: "Perguntar" }).className).toContain("btn-ai");
    rerender(<Button variant="success">Confirmar</Button>);
    expect(screen.getByRole("button", { name: "Confirmar" }).className).toContain("btn-success");
  });

  it("renders semantic badges with text", () => {
    render(
      <>
        <Badge tone="warning">Pendente</Badge>
        <Badge tone="progress">Vigente</Badge>
        <Badge tone="ai">IA</Badge>
      </>,
    );
    expect(screen.getByText("Pendente").className).toContain("badge-warning");
    expect(screen.getByText("Vigente").className).toContain("badge-progress");
    expect(screen.getByText("IA").className).toContain("badge-ai");
  });

  it("maps domain statuses to tones and labels", () => {
    expect(cycleStatusTone("active", true)).toBe("warning");
    expect(cycleStatusLabel("active", true)).toBe("Termina em breve");
    expect(cycleStatusTone("active", false)).toBe("progress");
    expect(cycleStatusLabel("active", false)).toBe("Vigente");
    expect(receivableStatusTone("received")).toBe("success");
    expect(receivableStatusLabel("received")).toBe("Recebido");
    expect(receivableStatusTone("pending")).toBe("warning");
    expect(receivableStatusLabel("pending")).toBe("Pendente");
  });

  it("associates label with input", () => {
    render(<TextField label="E-mail" name="email" />);
    expect(screen.getByLabelText("E-mail")).toBeInTheDocument();
  });

  it("shows single priority action without redundant hint strip", () => {
    render(
      <TodayBoard
        summary={{
          ...emptySummary,
          message: "Veja o que precisa da sua atenção hoje.",
          contextual_hint: "1 ciclo(s) encerrando",
          priority_action: {
            kind: "cycle_nearing_end",
            title: "Ciclo chegando ao fim",
            subtitle: "O ciclo de Ana termina em 4 dias e ainda não possui renovação encaminhada.",
            href: "/app/cycles/abc",
            entity_id: "abc",
            cta_label: "Ver ciclo",
          },
          attention_items: [
            {
              kind: "cycle_nearing_end",
              title: "Ana",
              subtitle: "Ciclo termina em 4 dias",
              href: "/app/cycles/abc",
              entity_id: "abc",
            },
          ],
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
    expect(screen.getByText("Veja o que precisa da sua atenção hoje.")).toBeInTheDocument();
    expect(screen.queryByText("1 ciclo(s) encerrando")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ciclo chegando ao fim" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ver ciclo/i })).toBeInTheDocument();
    expect(screen.getByText(/Precisa de atenção/)).toBeInTheDocument();
    expect(screen.getByText("Agenda de hoje")).toBeInTheDocument();
  });

  it("shows calm empty day when nothing needs attention", () => {
    render(<TodayBoard summary={emptySummary} />);
    expect(screen.getByText("Tudo organizado")).toBeInTheDocument();
    expect(screen.queryByText("Tudo certo por aqui")).not.toBeInTheDocument();
  });

  it("shows discrete calm line when agenda exists but no priority", () => {
    render(
      <TodayBoard
        summary={{
          ...emptySummary,
          message: "Veja o que precisa da sua atenção hoje.",
          upcoming_appointments: [
            {
              id: "a1",
              client_id: "c1",
              cycle_id: null,
              service_id: null,
              location_id: null,
              title: null,
              starts_at: "2026-07-24T20:00:00+00:00",
              ends_at: "2026-07-24T21:00:00+00:00",
              status: "scheduled",
              notes: null,
              created_at: "",
              updated_at: "",
              client_name: "Lia",
              service_name: "Personal",
              location_name: null,
              cycle_service_name: null,
            },
          ],
          priority_action: null,
          attention_items: [],
        }}
      />,
    );
    expect(screen.getByLabelText("Sem prioridade operacional")).toBeInTheDocument();
    expect(screen.getByText("Tudo em dia")).toBeInTheDocument();
    expect(screen.queryByLabelText("Ação prioritária")).not.toBeInTheDocument();
    expect(screen.getByText("Lia")).toBeInTheDocument();
    expect(screen.queryByText("Tudo organizado")).not.toBeInTheDocument();
  });

  it("shows in-progress badge and does not treat past as upcoming", () => {
    render(
      <TodayBoard
        summary={{
          ...emptySummary,
          in_progress_appointments: [
            {
              id: "ip1",
              client_id: "c1",
              cycle_id: null,
              service_id: null,
              location_id: null,
              title: null,
              starts_at: "2026-07-24T15:00:00+00:00",
              ends_at: "2026-07-24T16:00:00+00:00",
              status: "scheduled",
              notes: null,
              created_at: "",
              updated_at: "",
              client_name: "Bruno",
              service_name: "Personal",
              location_name: null,
              cycle_service_name: null,
            },
          ],
          upcoming_appointments: [],
          appointments_needing_outcome: [
            {
              id: "past1",
              client_id: "c1",
              cycle_id: null,
              service_id: null,
              location_id: null,
              title: null,
              starts_at: "2026-07-24T10:00:00+00:00",
              ends_at: "2026-07-24T11:00:00+00:00",
              status: "scheduled",
              notes: null,
              created_at: "",
              updated_at: "",
              client_name: "PastClient",
              service_name: "Personal",
              location_name: null,
              cycle_service_name: null,
            },
          ],
          priority_action: null,
          attention_items: [
            {
              kind: "appointment_needs_outcome",
              title: "PastClient",
              subtitle: "Compromisso de hoje às 07:00 · aguardando atualização",
              href: "/app/appointments/past1",
              entity_id: "past1",
            },
          ],
        }}
      />,
    );
    expect(screen.getByText("Em andamento")).toBeInTheDocument();
    expect(screen.getByText("Bruno")).toBeInTheDocument();
    expect(screen.getByText("PastClient")).toBeInTheDocument();
    expect(screen.queryByText("OrganizadoCard")).not.toBeInTheDocument();
  });

  it("does not show contradictory empty attention when items exist", () => {
    render(
      <TodayBoard
        summary={{
          ...emptySummary,
          message: "Veja o que precisa da sua atenção hoje.",
          priority_action: {
            kind: "renewal_requested",
            title: "Cliente quer continuar",
            subtitle: "Pedro enviou uma solicitação de renovação.",
            href: "/app/renewals",
            entity_id: "rr1",
            cta_label: "Revisar solicitação",
          },
          attention_items: [
            {
              kind: "renewal_requested",
              title: "Pedro",
              subtitle: "Renovação solicitada",
              href: "/app/renewals",
              entity_id: "rr1",
            },
          ],
        }}
      />,
    );
    expect(screen.getByText("Cliente quer continuar")).toBeInTheDocument();
    expect(screen.queryByText("Tudo organizado")).not.toBeInTheDocument();
    expect(screen.queryByText("Tudo certo por aqui")).not.toBeInTheDocument();
    expect(screen.getByText(/Precisa de atenção · 1/)).toBeInTheDocument();
  });
});
