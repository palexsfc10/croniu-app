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

  it("links to the unified Settings area and keeps operational rows, without duplicating account/workspace/billing forms here", () => {
    render(<MorePage />);
    expect(screen.getByRole("heading", { name: "Mais" })).toBeInTheDocument();
    expect(screen.getByText(/Configure como o Croniu funciona/i)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Conta e configurações/i })[0]).toHaveAttribute(
      "href",
      "/app/settings",
    );
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
    // These 4 screens moved into /app/settings — no longer duplicated here.
    expect(screen.queryByRole("link", { name: /Perfil profissional/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Horários de atendimento/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Preferências gerais/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Ajuda e feedback/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Assinatura")).not.toBeInTheDocument();
    expect(screen.queryByText("owner")).not.toBeInTheDocument();
    expect(screen.queryByText(/E-mail/i)).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain("mailto:");
  });
});
