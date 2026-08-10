import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async () => ({ data: [], error: null })),
}));

import { ClientEvaluationsSection } from "@/components/app/client-evaluations-section";

describe("ClientEvaluationsSection", () => {
  afterEach(() => cleanup());

  it("shows empty state and create action", async () => {
    render(<ClientEvaluationsSection clientId="c1" />);
    await waitFor(() => {
      expect(screen.getByText(/Nenhuma avaliação ainda/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: /Nova avaliação/i })).toHaveAttribute(
      "href",
      "/app/clients/c1/evaluations/new",
    );
  });
});
