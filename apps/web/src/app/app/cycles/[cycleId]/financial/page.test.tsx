import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ cycleId: "cycle-1" }),
  useRouter: () => ({ replace: vi.fn() }),
}));

const apiFetch = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    apiFetch: (...args: unknown[]) => apiFetch(...args),
  };
});

import CycleFinancialEditPage from "@/app/app/cycles/[cycleId]/financial/page";

const cycle = {
  id: "cycle-1",
  client_id: "c1",
  service_id: "s1",
  cycle_type: "period",
  status: "active",
  starts_on: "2026-08-01",
  ends_on: "2026-09-01",
  lesson_count: 8,
  unit_price_cents: 9000,
  subtotal_cents: 72000,
  adjustment_cents: 0,
  value_cents: 72000,
  is_legacy: false,
  notes: null,
  last_contacted_at: null,
  contact_confirmed_at: null,
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
  client_name: "Ana Souza",
  service_name: "Personal",
  days_remaining: 10,
  is_nearing_end: false,
};

describe("Cycle financial edit page", () => {
  afterEach(() => {
    cleanup();
    apiFetch.mockReset();
  });

  beforeEach(() => {
    apiFetch.mockImplementation(async (path: string) => {
      if (path.includes("/cycles/cycle-1") && !path.includes("/financial")) {
        return { data: cycle, status: 200 };
      }
      if (path.includes("/receivables")) {
        return {
          data: [
            {
              id: "r1",
              cycle_id: "cycle-1",
              client_id: "c1",
              amount_cents: 72000,
              due_on: "2026-08-01",
              status: "pending",
              paid_at: null,
              payment_method: null,
              notes: null,
              created_at: "",
              updated_at: "",
            },
          ],
          status: 200,
        };
      }
      return { data: cycle, status: 200 };
    });
  });

  it("shows composition and agenda warning", async () => {
    render(<CycleFinancialEditPage />);
    expect(await screen.findByRole("heading", { name: "Editar valores" })).toBeInTheDocument();
    expect(screen.getByText(/Valor por aula/)).toBeInTheDocument();
    expect(screen.getByText(/Agenda permanecerá igual/i)).toBeInTheDocument();
    expect(screen.getByText(/pending/i)).toBeInTheDocument();
  });

  it("preview discount before confirm", async () => {
    const user = userEvent.setup();
    render(<CycleFinancialEditPage />);
    await screen.findByRole("heading", { name: "Editar valores" });
    const discount = screen.getByLabelText(/Desconto/);
    await user.clear(discount);
    await user.type(discount, "60,00");
    expect(screen.getByText(/Prévia/)).toBeInTheDocument();
    expect(screen.getByText(/660/)).toBeInTheDocument();
  });

  it("blocks when payment confirmed", async () => {
    apiFetch.mockImplementation(async (path: string) => {
      if (path.includes("/cycles/cycle-1") && !path.includes("/financial")) {
        return { data: cycle, status: 200 };
      }
      if (path.includes("/receivables")) {
        return {
          data: [
            {
              id: "r1",
              cycle_id: "cycle-1",
              client_id: "c1",
              amount_cents: 72000,
              due_on: "2026-08-01",
              status: "received",
              paid_at: "2026-08-02T00:00:00Z",
              payment_method: null,
              notes: null,
              created_at: "",
              updated_at: "",
            },
          ],
          status: 200,
        };
      }
      return { status: 200 };
    });
    render(<CycleFinancialEditPage />);
    expect(
      await screen.findByText(/pagamento já foi confirmado/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Revisar/i })).not.toBeInTheDocument();
  });
});
