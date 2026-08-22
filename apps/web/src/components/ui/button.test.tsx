import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button";

describe("Button", () => {
  it("defaults to the comfortable 44px size", () => {
    render(<Button>Salvar</Button>);
    expect(screen.getByRole("button", { name: "Salvar" })).toHaveClass("min-h-11");
  });

  it("renders a compact 36px control with size='sm'", () => {
    render(<Button size="sm">Filtrar</Button>);
    const btn = screen.getByRole("button", { name: "Filtrar" });
    expect(btn).toHaveClass("min-h-9");
    expect(btn).not.toHaveClass("min-h-11");
  });

  it("shows a spinner, disables the button, and marks it aria-busy when loading", () => {
    render(<Button loading>Confirmar ciclo</Button>);
    const btn = screen.getByRole("button", { name: "Confirmar ciclo" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
    expect(btn.querySelector("svg")).toBeInTheDocument();
  });

  it("is not aria-busy or disabled when not loading", () => {
    render(<Button>Confirmar ciclo</Button>);
    const btn = screen.getByRole("button", { name: "Confirmar ciclo" });
    expect(btn).not.toBeDisabled();
    expect(btn).not.toHaveAttribute("aria-busy");
  });

  it("stays disabled via loading even if the caller also passes disabled=false", () => {
    render(
      <Button loading disabled={false}>
        Enviar
      </Button>,
    );
    expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();
  });

  it("respects an explicit disabled prop independent of loading", () => {
    render(<Button disabled>Enviar</Button>);
    const btn = screen.getByRole("button", { name: "Enviar" });
    expect(btn).toBeDisabled();
    expect(btn).not.toHaveAttribute("aria-busy");
  });

  it("still fires onClick when idle (not loading, not disabled)", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Enviar</Button>);
    screen.getByRole("button", { name: "Enviar" }).click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("applies the primary variant class by default and switches with variant", () => {
    const { rerender } = render(<Button>Padrão</Button>);
    expect(screen.getByRole("button", { name: "Padrão" })).toHaveClass("btn-primary");
    rerender(<Button variant="danger">Excluir</Button>);
    expect(screen.getByRole("button", { name: "Excluir" })).toHaveClass("btn-danger");
  });

  it("applies fullWidth as w-full", () => {
    render(<Button fullWidth>Continuar</Button>);
    expect(screen.getByRole("button", { name: "Continuar" })).toHaveClass("w-full");
  });
});
