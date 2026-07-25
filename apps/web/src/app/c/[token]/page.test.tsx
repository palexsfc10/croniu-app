import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({
  useParams: () => ({ token: "tok123" }),
}));

vi.mock("@/components/brand/brand-wordmark", () => ({
  BrandWordmark: () => <span>Croniu</span>,
}));

import PublicMyCyclePage from "@/app/c/[token]/page";

describe("Public Meu Ciclo page", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          professional_display_name: "Studio",
          client_first_name: "Renata",
          cycle: {
            service_name: "Personal",
            status_summary: "vigente",
            starts_on: "2026-08-01",
            ends_on: "2026-09-01",
            lesson_count: 8,
            remaining_planned_lessons: 3,
            value_cents: 72000,
            payment_status: "pendente",
          },
          payment_instructions: { configured: false },
          can_request_renewal: true,
          can_report_payment: true,
        }),
      })),
    );
  });

  it("renders cycle without internal ids", async () => {
    render(<PublicMyCyclePage />);
    expect(await screen.findByText(/Olá, Renata/i)).toBeInTheDocument();
    expect(screen.getByText(/Personal/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Quero renovar/i })).toBeInTheDocument();
    expect(screen.queryByText(/organization/i)).not.toBeInTheDocument();
  });
});
