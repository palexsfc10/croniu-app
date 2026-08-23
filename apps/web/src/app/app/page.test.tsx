import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/app/today-board", () => ({
  TodayBoard: ({ summary }: { summary: { message: string } }) => (
    <div data-testid="today-board">{summary.message}</div>
  ),
}));

const apiState = vi.hoisted(() => ({ mode: "ok" as "ok" | "error" | "null" }));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    apiFetch: vi.fn(async () => {
      if (apiState.mode === "error") return { error: { message: "Falha ao carregar." } };
      if (apiState.mode === "null") return { data: null };
      return { data: { message: "Tudo em dia." } };
    }),
  };
});

import AppHomePage from "@/app/app/page";

describe("AppHomePage", () => {
  it("renders the dashboard once the summary loads", async () => {
    apiState.mode = "ok";
    render(<AppHomePage />);
    expect(await screen.findByTestId("today-board")).toHaveTextContent("Tudo em dia.");
  });

  it("shows a retryable error state instead of leaving the page blank", async () => {
    apiState.mode = "error";
    render(<AppHomePage />);
    expect(await screen.findByText("Não foi possível carregar seu painel")).toBeInTheDocument();
    expect(screen.getByText("Falha ao carregar.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
  });

  it("never renders a bare blank page when the API returns no summary and no error", async () => {
    apiState.mode = "null";
    render(<AppHomePage />);
    expect(await screen.findByText("Painel indisponível no momento")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
  });

  it("retrying re-fetches and can recover into the dashboard", async () => {
    apiState.mode = "error";
    render(<AppHomePage />);
    await screen.findByText("Não foi possível carregar seu painel");

    apiState.mode = "ok";
    screen.getByRole("button", { name: "Tentar novamente" }).click();

    await waitFor(() =>
      expect(screen.queryByText("Não foi possível carregar seu painel")).not.toBeInTheDocument(),
    );
    expect(await screen.findByTestId("today-board")).toHaveTextContent("Tudo em dia.");
  });
});
