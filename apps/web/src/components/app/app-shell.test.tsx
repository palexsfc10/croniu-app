import { cleanup, render, screen, within } from "@testing-library/react";
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

function expectLink(name: string | RegExp, href: string) {
  const links = screen.getAllByRole("link", { name });
  expect(links.length).toBeGreaterThanOrEqual(1);
  for (const link of links) {
    expect(link).toHaveAttribute("href", href);
  }
}

describe("AppShell nav Sprint 2B", () => {
  afterEach(() => cleanup());

  it("exposes Hoje Agenda Clientes Ciclos Mais", () => {
    render(
      <AppShell>
        <p>content</p>
      </AppShell>,
    );
    expectLink("Hoje", "/app");
    expectLink("Agenda", "/app/agenda");
    expectLink("Clientes", "/app/clients");
    expectLink("Ciclos", "/app/cycles");
    expectLink("Mais", "/app/profile");
    expectLink("Manual", "/app/manual");
    expectLink(/Assistente/, "/app/assistant");

    const navs = screen.getAllByRole("navigation", { name: "Navegação principal" });
    expect(navs.length).toBe(2);
    expect(within(navs[0]).getByRole("link", { name: "Hoje" })).toHaveAttribute("href", "/app");
    expect(within(navs[1]).getByRole("link", { name: "Hoje" })).toHaveAttribute("href", "/app");
    expect(screen.queryByRole("button", { name: "Sair" })).not.toBeInTheDocument();
  }, 15_000);
});
