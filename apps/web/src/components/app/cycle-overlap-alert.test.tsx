import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CycleOverlapAlert } from "./cycle-overlap-alert";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("CycleOverlapAlert", () => {
  afterEach(() => cleanup());

  it("shows duplicate actions", () => {
    render(
      <CycleOverlapAlert
        code="DUPLICATE_CYCLE"
        message="Já existe um ciclo igual para este cliente neste período."
        existingCycleId="abc"
        clientId="cli"
        onAdjustPeriod={() => undefined}
        onCancel={() => undefined}
      />
    );
    expect(screen.getByRole("link", { name: "Ver ciclo existente" })).toHaveAttribute(
      "href",
      "/app/cycles/abc"
    );
    expect(screen.getByRole("link", { name: "Voltar para a ficha" })).toHaveAttribute(
      "href",
      "/app/clients/cli"
    );
  });

  it("shows overlap actions", () => {
    render(
      <CycleOverlapAlert
        code="OVERLAPPING_CYCLE"
        message="Este cliente já possui um ciclo desse serviço que coincide com o período selecionado."
        existingCycleId="xyz"
        onAdjustPeriod={() => undefined}
        onCancel={() => undefined}
      />
    );
    expect(screen.getByRole("button", { name: "Ajustar período" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
  });
});
