import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EnvironmentBadge, EnvironmentIdentity } from "@/components/environment-identity";
import { presentCroniuEnvironment } from "@/lib/environment";

describe("environment presentation", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("maps production to Produção labels", () => {
    const view = presentCroniuEnvironment("production");
    expect(view.badge).toBe("Produção");
    expect(view.description).toBe("Painel operacional de produção");
    expect(view.headline).toBe("Produção");
  });

  it("maps hml to HML labels", () => {
    const view = presentCroniuEnvironment("hml");
    expect(view.badge).toBe("HML");
    expect(view.description).toBe("Painel operacional de homologação");
  });

  it("does not treat empty or unknown as HML or Produção", () => {
    expect(presentCroniuEnvironment(undefined).badge).toBe("Ambiente desconhecido");
    expect(presentCroniuEnvironment("").canonical).toBe("unknown");
    expect(presentCroniuEnvironment("weird").badge).toBe("Ambiente desconhecido");
    expect(presentCroniuEnvironment(null).description).not.toContain("piloto");
  });

  it("renders production identity without piloto copy", () => {
    render(<EnvironmentIdentity environment="production" />);
    expect(screen.getByText("Produção")).toBeInTheDocument();
    expect(screen.getByText("Painel operacional de produção")).toBeInTheDocument();
    expect(screen.queryByText(/piloto/i)).not.toBeInTheDocument();
  });

  it("renders hml identity for homologation", () => {
    render(<EnvironmentIdentity environment="hml" />);
    expect(screen.getByText("HML")).toBeInTheDocument();
    expect(screen.getByText("Painel operacional de homologação")).toBeInTheDocument();
  });

  it("renders compact badge for mobile header", () => {
    render(<EnvironmentBadge environment="production" />);
    expect(screen.getByText("Produção")).toBeInTheDocument();
  });
});
