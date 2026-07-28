import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/app/app-shell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app",
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    loading: false,
    me: {
      user: { id: "1", email: "a@b.com", full_name: "Pro", created_at: "" },
      organization: { id: "1", name: "Studio", timezone: "America/Sao_Paulo" },
      role: "owner",
    },
    logout: vi.fn(),
  }),
}));

describe("AppShell nav Sprint 2B", () => {
  afterEach(() => cleanup());

  it("exposes Hoje Agenda Clientes Ciclos Mais", () => {
    render(
      <AppShell>
        <p>content</p>
      </AppShell>,
    );
    expect(screen.getByRole("link", { name: "Hoje" })).toHaveAttribute("href", "/app");
    expect(screen.getByRole("link", { name: "Agenda" })).toHaveAttribute("href", "/app/agenda");
    expect(screen.getByRole("link", { name: "Clientes" })).toHaveAttribute("href", "/app/clients");
    expect(screen.getByRole("link", { name: "Ciclos" })).toHaveAttribute("href", "/app/cycles");
    expect(screen.getByRole("link", { name: "Mais" })).toHaveAttribute("href", "/app/profile");
    expect(screen.getByRole("link", { name: "Manual" })).toHaveAttribute("href", "/app/manual");
    expect(screen.queryByRole("button", { name: "Sair" })).not.toBeInTheDocument();
  });
});
