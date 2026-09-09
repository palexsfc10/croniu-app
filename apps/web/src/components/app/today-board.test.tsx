import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HomeSummary } from "@/lib/api";

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    me: {
      user: { full_name: "Profissional Teste" },
      organization: { timezone: "America/Sao_Paulo", profession_code: "personal_trainer" },
    },
  }),
}));

const board = vi.hoisted(() => ({ items: [] as unknown[] }));
const accompaniment = vi.hoisted(() => ({ items: [] as unknown[] }));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    apiFetch: vi.fn(async (path: string) => {
      if (path.includes("/routines/board")) return { data: { groups: [{ items: board.items }] } };
      if (path.includes("/accompaniment/pending")) return { data: { items: accompaniment.items } };
      if (path.includes("/receivables/overview")) {
        return {
          data: {
            summary: { received_month_cents: 0, overdue_cents: 0, overdue_count: 0, forecast_month_cents: 0, pending_count: 0 },
          },
        };
      }
      if (path.includes("/billing/entitlement")) return { data: null };
      return { data: null };
    }),
  };
});

import { TodayBoard } from "@/components/app/today-board";

afterEach(() => {
  board.items = [];
  accompaniment.items = [];
});

/** The briefing box above the queue promotes one case out of the same
 * pool ("Vale olhar"/"Principal risco") and the queue never shows that
 * exact case again. Tests that are about the QUEUE's own rendering (not
 * about the briefing/queue overlap itself) add this unrelated filler so
 * IT gets promoted instead of the item under test — same pool order as
 * the component (accompaniment before routines), so a single filler here
 * always wins the promotion, leaving every routine item asserted below
 * untouched in the queue. */
function addFillerPromotedToBriefing() {
  accompaniment.items = [
    { client_id: "filler", client_name: "Outra Pendência", days_since_last_evaluation: 5 },
  ];
}

const BASE_SUMMARY: HomeSummary = {
  organization_id: "org1",
  timezone: "America/Sao_Paulo",
  local_today: "2026-08-22",
  today_appointments: [],
  cycles_nearing_end: [],
  renewals: [],
  pending_payments: [],
  priority_action: null,
  contextual_hint: null,
  message: "Tudo em dia por aqui.",
  // Non-zero so the professional never reads as brand-new — routine
  // pendencies alone must not trigger the New-Professional journey.
  routines_due_today_count: 5,
};

describe("TodayBoard — only overdue routine occurrences ever enter the priority queue", () => {
  it("shows the overdue item labeled 'Rotina' and never shows the due-today (not overdue) one anywhere on the Home", async () => {
    board.items = [
      {
        id: "overdue-1",
        name: "Revisar plano",
        type_label: "Revisão",
        client_name: "Aluna Atrasada",
        client_id: "c-overdue",
        overdue: true,
        due_on: "2026-08-20",
        occurrence_type: "plan_review",
      },
      {
        id: "today-1",
        name: "Registrar feedback",
        type_label: "Feedback",
        client_name: "Aluno Hoje",
        client_id: "c-today",
        overdue: false,
        due_on: "2026-08-22",
        occurrence_type: "feedback",
      },
    ];
    addFillerPromotedToBriefing();
    render(<TodayBoard summary={BASE_SUMMARY} />);

    const queue = await screen.findByRole("region", { name: "Fila de prioridades" });
    expect(within(queue).getByText("Aluna Atrasada · venceu em 20/08/2026")).toBeInTheDocument();
    // "Rotina" appears as the origin label exactly for the overdue item —
    // never a second, unrelated "Rotinas de hoje" list.
    expect(within(queue).getByText("Rotina")).toBeInTheDocument();
    expect(screen.queryByText(/Aluno Hoje/)).not.toBeInTheDocument();
    expect(screen.queryByText("Registrar feedback")).not.toBeInTheDocument();
  });

  it("lists every overdue item individually — never grouped into a summary row", async () => {
    board.items = [
      { id: "a", type_label: "Rotina", client_name: "Cliente A", client_id: "c-a", overdue: true, due_on: "2026-08-15", occurrence_type: "occ-a" },
      { id: "b", type_label: "Rotina", client_name: "Cliente B", client_id: "c-b", overdue: true, due_on: "2026-08-16", occurrence_type: "occ-b" },
      { id: "c", type_label: "Rotina", client_name: "Cliente C", client_id: "c-c", overdue: true, due_on: "2026-08-17", occurrence_type: "occ-c" },
    ];
    addFillerPromotedToBriefing();
    render(<TodayBoard summary={BASE_SUMMARY} />);

    const queue = await screen.findByRole("region", { name: "Fila de prioridades" });
    expect(within(queue).getByText("Cliente A · venceu em 15/08/2026")).toBeInTheDocument();
    expect(within(queue).getByText("Cliente B · venceu em 16/08/2026")).toBeInTheDocument();
    expect(within(queue).getByText("Cliente C · venceu em 17/08/2026")).toBeInTheDocument();
    expect(screen.queryByText("Atrasadas")).not.toBeInTheDocument();
  });

  it("caps the desktop queue at 3 items — the header still counts the real total, and the extras never collapse into a summary row", async () => {
    board.items = [
      { id: "a", type_label: "Rotina", client_name: "Cliente A", client_id: "c-a", overdue: true, due_on: "2026-08-15", occurrence_type: "occ-a" },
      { id: "b", type_label: "Rotina", client_name: "Cliente B", client_id: "c-b", overdue: true, due_on: "2026-08-16", occurrence_type: "occ-b" },
      { id: "c", type_label: "Rotina", client_name: "Cliente C", client_id: "c-c", overdue: true, due_on: "2026-08-17", occurrence_type: "occ-c" },
      { id: "d", type_label: "Rotina", client_name: "Cliente D", client_id: "c-d", overdue: true, due_on: "2026-08-18", occurrence_type: "occ-d" },
    ];
    addFillerPromotedToBriefing();
    render(<TodayBoard summary={BASE_SUMMARY} />);

    const queue = await screen.findByRole("region", { name: "Fila de prioridades" });
    // The filler above was promoted to the briefing box ("Vale olhar"),
    // so the queue's own title reflects that it holds the rest — the real
    // remaining total (4, all real routine items) still shows in full.
    expect(within(queue).getByText(/Outras decisões/)).toHaveTextContent("Outras decisões · 4");
    expect(within(queue).getByText("Cliente A · venceu em 15/08/2026")).toBeInTheDocument();
    expect(within(queue).getByText("Cliente B · venceu em 16/08/2026")).toBeInTheDocument();
    expect(within(queue).getByText("Cliente C · venceu em 17/08/2026")).toBeInTheDocument();
    expect(within(queue).queryByText(/Cliente D/)).not.toBeInTheDocument();
    expect(within(queue).queryByText(/^4 /)).not.toBeInTheDocument();
  });
});

describe("TodayBoard — desktop grid uses one consistent 12-column track, not two disagreeing grids", () => {
  it("Financeiro/Indicadores and Rotinas/Próximo compromisso share the same grid and the same 7/5 column spans", () => {
    render(<TodayBoard summary={BASE_SUMMARY} />);
    const financeCol = screen.getByText("Financeiro").closest("section")!.parentElement!;
    const indicatorsCol = screen.getByText("Clientes ativos").closest("section")!.parentElement!;
    const routinesCol = screen.getByLabelText("Rotinas").parentElement!;

    // Same grid container for all four blocks — not a second, separately
    // tracked grid with a different column basis below it.
    const grid = financeCol.parentElement!;
    expect(grid.className).toMatch(/grid/);
    expect(grid).toBe(indicatorsCol.parentElement);
    expect(grid).toBe(routinesCol.parentElement);
    expect(financeCol.className).toMatch(/xl:col-span-7/);
    expect(routinesCol.className).toMatch(/xl:col-span-7/);
    expect(indicatorsCol.className).toMatch(/xl:col-span-5/);
  });
});

describe("TodayBoard — the briefing box and the priority queue never show the same case twice", () => {
  it("removes the promoted case from the queue and renames it to 'Outras decisões'", async () => {
    accompaniment.items = [
      { client_id: "c1", client_name: "João Neves", days_since_last_evaluation: null },
    ];
    render(<TodayBoard summary={BASE_SUMMARY} />);

    // The briefing box promotes the one and only case as "Vale olhar".
    await screen.findByText(/Vale olhar:/);
    expect(screen.getByText(/Avaliação pendente · João Neves/)).toBeInTheDocument();
    // It never appears a second time, inside a "Precisa de decisão" queue.
    expect(screen.queryByRole("region", { name: "Fila de prioridades" })).not.toBeInTheDocument();
  });

  it("keeps the queue as 'Precisa de decisão' (unrenamed) when nothing was promoted out of it", async () => {
    board.items = [
      { id: "a", type_label: "Rotina", client_name: "Cliente A", client_id: "c-a", overdue: true, due_on: "2026-08-15", occurrence_type: "occ-a" },
    ];
    // priority_action absorbs "mainRisk" from an unrelated pool the queue
    // never draws from, so nothing here gets excluded from the queue.
    render(
      <TodayBoard
        summary={{
          ...BASE_SUMMARY,
          priority_action: {
            kind: "pending_payment",
            title: "Cobrança vencida",
            subtitle: "Outro cliente",
            href: "/app/receivables/r9",
            entity_id: "r9",
          },
        }}
      />,
    );

    const queue = await screen.findByRole("region", { name: "Fila de prioridades" });
    expect(within(queue).getByText(/^Precisa de decisão/)).toBeInTheDocument();
    expect(within(queue).getByText("Cliente A · venceu em 15/08/2026")).toBeInTheDocument();
  });

  it("mobile: the single highlighted card also never repeats what the briefing already promoted", async () => {
    accompaniment.items = [
      { client_id: "c1", client_name: "João Neves", days_since_last_evaluation: null },
    ];
    render(<TodayBoard summary={BASE_SUMMARY} />);

    await screen.findByText(/Vale olhar:/);
    // Only one occurrence of the case anywhere on the page — the briefing
    // line — never a second mobile teaser card repeating it.
    expect(screen.getAllByText(/Avaliação pendente · João Neves/)).toHaveLength(1);
    expect(screen.getByText("Nenhuma decisão pendente agora.")).toBeInTheDocument();
  });
});

describe("TodayBoard — an overdue evaluation review routes straight to the evaluation form", () => {
  it("shows a single link straight to that client's evaluation form", async () => {
    board.items = [
      {
        id: "occ-eval-1",
        name: "Realizar avaliação",
        type_label: "Revisar avaliação",
        client_name: "Fernando",
        client_id: "client-fernando",
        overdue: true,
        due_on: "2026-08-21",
        occurrence_type: "evaluation_review",
      },
    ];
    addFillerPromotedToBriefing();
    render(<TodayBoard summary={BASE_SUMMARY} />);

    const queue = await screen.findByRole("region", { name: "Fila de prioridades" });
    const link = within(queue).getByRole("link", { name: /Realizar avaliação/i });
    expect(link).toHaveTextContent("Fernando");
    expect(link).toHaveAttribute(
      "href",
      "/app/clients/client-fernando/evaluations/new?returnTo=%2Fapp&occurrenceId=occ-eval-1",
    );

    // Whole row is exactly one <a> — no nested/duplicate link that could
    // double-fire navigation on a single tap.
    const container = link.closest("li");
    expect(container?.querySelectorAll("a")).toHaveLength(1);
  });

  it("never shows a due-today (not overdue) evaluation review — that belongs to the Rotinas screen, not the Home", async () => {
    board.items = [
      {
        id: "occ-eval-today",
        name: "Realizar avaliação",
        type_label: "Revisar avaliação",
        client_name: "Ana",
        client_id: "client-ana",
        overdue: false,
        due_on: "2026-08-22",
        occurrence_type: "evaluation_review",
      },
    ];
    render(<TodayBoard summary={BASE_SUMMARY} />);

    await screen.findByText("Financeiro");
    expect(screen.queryByText(/Realizar avaliação/)).not.toBeInTheDocument();
    expect(screen.queryByText("Ana")).not.toBeInTheDocument();
  });

  it("routes an overdue non-evaluation occurrence (plan_review) to the client profile instead of a form", async () => {
    board.items = [
      {
        id: "occ-plan",
        name: "Revisar plano",
        type_label: "Revisão",
        client_name: "Cliente Plano",
        client_id: "client-plano",
        overdue: true,
        due_on: "2026-08-20",
        occurrence_type: "plan_review",
      },
    ];
    addFillerPromotedToBriefing();
    render(<TodayBoard summary={BASE_SUMMARY} />);

    const queue = await screen.findByRole("region", { name: "Fila de prioridades" });
    const link = within(queue).getByRole("link", { name: /Revisar plano/i });
    expect(link).toHaveAttribute("href", "/app/clients/client-plano");
  });

  it("shows a success confirmation once, reading a sessionStorage flag set by the evaluation form", async () => {
    sessionStorage.setItem("croniu.evaluation-saved-celebrate", "1");
    board.items = [];
    render(<TodayBoard summary={BASE_SUMMARY} />);

    expect(await screen.findByText("Avaliação registrada com sucesso")).toBeInTheDocument();
    // Consumed — a fresh render (e.g. next visit) must not show it again.
    expect(sessionStorage.getItem("croniu.evaluation-saved-celebrate")).toBeNull();
  });

  it("never shows 'N itens urgentes' next to 'Nenhuma pendência crítica agora' — an accompaniment pendency with no backend attention_items used to trigger exactly that", async () => {
    board.items = [];
    accompaniment.items = [
      { client_id: "c1", client_name: "Murilo Macedo", days_since_last_evaluation: 21 },
    ];
    render(<TodayBoard summary={BASE_SUMMARY} />);

    await screen.findByText(/item urgente/);
    expect(screen.queryByText("Nenhuma pendência crítica agora.")).not.toBeInTheDocument();
    expect(screen.getByText(/Vale olhar:/)).toBeInTheDocument();
  });
});

describe("TodayBoard — compact Financeiro (recebido/vencido/próximo, never the full dashboard)", () => {
  it("shows a dash for 'próximo a vencer' when there are no pending payments", async () => {
    board.items = [];
    render(<TodayBoard summary={{ ...BASE_SUMMARY, pending_payments: [] }} />);

    expect(await screen.findByText("Sem cobrança prevista")).toBeInTheDocument();
    expect(screen.getByText("Recebido no mês")).toBeInTheDocument();
    // Never the old full total-of-all-pendencies phrasing — that duplicated
    // the real Financeiro central instead of pointing to it.
    expect(screen.queryByText(/cobranças em aberto/)).not.toBeInTheDocument();
  });

  it("shows the next-due amount and date derived from real pending_payments, never a mocked number", async () => {
    board.items = [];
    render(
      <TodayBoard
        summary={{
          ...BASE_SUMMARY,
          pending_payments: [
            {
              id: "r1",
              cycle_id: "cy1",
              client_id: "c1",
              amount_cents: 15000,
              due_on: "2026-08-25",
              status: "pending",
              paid_at: null,
              payment_method: null,
              notes: null,
              created_at: "2026-08-01T00:00:00Z",
              updated_at: "2026-08-01T00:00:00Z",
              client_name: "Aluna A",
              cycle_service_name: null,
            },
            {
              id: "r2",
              cycle_id: "cy2",
              client_id: "c2",
              amount_cents: 9000,
              due_on: "2026-08-20",
              status: "pending",
              paid_at: null,
              payment_method: null,
              notes: null,
              created_at: "2026-08-01T00:00:00Z",
              updated_at: "2026-08-01T00:00:00Z",
              client_name: "Aluno B",
              cycle_service_name: null,
            },
          ],
        }}
      />,
    );

    // r2 due_on 08-20 is earlier than r1's 08-25 — the earliest one wins.
    expect(await screen.findByText(/R\$\s*90,00/)).toBeInTheDocument();
  });
});

describe("TodayBoard — quick actions always point to real, existing routes", () => {
  it("links to novo cliente, novo compromisso, nova rotina and a Cronia", async () => {
    board.items = [];
    render(<TodayBoard summary={BASE_SUMMARY} />);
    await screen.findByText("Financeiro");

    expect(screen.getByRole("link", { name: /Novo cliente/i })).toHaveAttribute(
      "href",
      "/app/clients/new",
    );
    expect(screen.getByRole("link", { name: /Novo compromisso/i })).toHaveAttribute(
      "href",
      "/app/appointments/new",
    );
    expect(screen.getByRole("link", { name: /Nova rotina/i })).toHaveAttribute(
      "href",
      "/app/routines",
    );
    expect(screen.getByRole("link", { name: /Perguntar à Cronia/i })).toHaveAttribute(
      "href",
      expect.stringContaining("/app/assistant?"),
    );
  });

  it("mobile collapses the 3 creation actions into a single 'Adicionar' sheet, without Perguntar à Cronia (the bottom-nav orb already covers that)", async () => {
    board.items = [];
    render(<TodayBoard summary={BASE_SUMMARY} />);
    await screen.findByText("Financeiro");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByRole("link", { name: /Novo cliente/i })).toHaveAttribute(
      "href",
      "/app/clients/new",
    );
    expect(within(sheet).getByRole("link", { name: /Novo compromisso/i })).toHaveAttribute(
      "href",
      "/app/appointments/new",
    );
    expect(within(sheet).getByRole("link", { name: /Nova rotina/i })).toHaveAttribute(
      "href",
      "/app/routines",
    );
    expect(within(sheet).queryByRole("link", { name: /Perguntar à Cronia/i })).not.toBeInTheDocument();
  });
});
