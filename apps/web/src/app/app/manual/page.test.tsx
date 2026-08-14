import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ManualPage from "@/app/app/manual/page";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    me: {
      organization: { profession_code: "consultant" },
    },
  }),
}));

describe("Manual", () => {
  afterEach(() => cleanup());

  it("uses current product terms and recommended first steps", () => {
    render(<ManualPage />);
    expect(screen.getByRole("heading", { name: "Manual" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Primeiros passos" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Serviços" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Modelos de ciclo" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Portal" })).toBeInTheDocument();
    expect(screen.getByText(/Portal do cliente/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Meu Ciclo/ })).not.toBeInTheDocument();
    expect(screen.getAllByText(/Exemplo para consultor/).length).toBeGreaterThan(0);
  });
});
