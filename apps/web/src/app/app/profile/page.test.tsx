import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MorePage from "@/app/app/profile/page";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("Mais page", () => {
  afterEach(() => cleanup());

  it("shows compact settings groups without profile card or owner", () => {
    render(<MorePage />);
    expect(screen.getByRole("heading", { name: "Mais" })).toBeInTheDocument();
    expect(screen.getByText(/Configure como o Croniu funciona/i)).toBeInTheDocument();
    expect(screen.getByText("Configurações do trabalho")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Serviços/i })).toHaveAttribute("href", "/app/services");
    expect(screen.getByRole("link", { name: /Modelos de ciclo/i })).toHaveAttribute(
      "href",
      "/app/cycle-templates",
    );
    expect(screen.getByRole("link", { name: /Configuração inicial/i })).toHaveAttribute(
      "href",
      "/app/setup",
    );
    expect(screen.getByRole("link", { name: /^Manual/i })).toHaveAttribute("href", "/app/manual");
    expect(screen.getByRole("link", { name: /Locais/i })).toHaveAttribute("href", "/app/locations");
    expect(screen.getByRole("link", { name: /Horários de atendimento/i })).toHaveAttribute(
      "href",
      "/app/availability",
    );
    expect(screen.getByRole("link", { name: /Preferências gerais/i })).toHaveAttribute(
      "href",
      "/app/preferences",
    );
    expect(screen.getByRole("link", { name: /Ajuda e feedback/i })).toHaveAttribute(
      "href",
      "/app/help",
    );
    expect(screen.queryByText("Assinatura")).not.toBeInTheDocument();
    expect(screen.queryByText("owner")).not.toBeInTheDocument();
    expect(screen.queryByText(/E-mail/i)).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain("mailto:");
  });
});
