import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/app/app-shell";

const logout = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/app",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async () => ({
    data: { has_active_access: true, can_write: true, billing_setup_status: "available" },
    status: 200,
  })),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    onClick,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
    onClick?: () => void;
  }) => (
    <a href={href} onClick={onClick} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    loading: false,
    me: {
      user: { id: "1", email: "a@b.com", full_name: "Pro Silva", created_at: "" },
      organization: { id: "1", name: "Studio Alpha", timezone: "America/Sao_Paulo" },
      role: "owner",
    },
    logout,
  }),
}));

describe("AppShell account navigation", () => {
  afterEach(() => {
    cleanup();
    logout.mockClear();
  });

  it("exposes primary nav without Manual or mailto", () => {
    render(
      <AppShell>
        <p>content</p>
      </AppShell>,
    );
    expect(screen.getAllByRole("link", { name: "Mais" })[0]).toHaveAttribute("href", "/app/profile");
    expect(screen.queryByRole("link", { name: "Manual" })).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain("mailto:");
    expect(document.body.innerHTML).not.toMatch(/appcroniu@gmail\.com/i);
    expect(screen.queryByText("owner")).not.toBeInTheDocument();
  });

  it("opens avatar menu with account billing help and logout", () => {
    render(
      <AppShell>
        <p>content</p>
      </AppShell>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Abrir menu da conta" }));
    const menu = screen.getByRole("menu", { name: "Conta" });
    expect(within(menu).getByRole("menuitem", { name: /Minha conta/i })).toHaveAttribute(
      "href",
      "/app/account",
    );
    expect(within(menu).getByRole("menuitem", { name: /Assinatura/i })).toHaveAttribute(
      "href",
      "/app/billing",
    );
    expect(within(menu).getByRole("menuitem", { name: /Ajuda e feedback/i })).toHaveAttribute(
      "href",
      "/app/help",
    );
    expect(within(menu).queryByRole("menuitem", { name: /Manual/i })).not.toBeInTheDocument();
    expect(within(menu).queryByText("owner")).not.toBeInTheDocument();
    expect(within(menu).queryByText(/a@b\.com/)).not.toBeInTheDocument();
    fireEvent.click(within(menu).getByRole("menuitem", { name: /Sair/i }));
    expect(logout).toHaveBeenCalled();
  });

  it("closes avatar menu on outside click and Escape", () => {
    render(
      <AppShell>
        <p>content</p>
      </AppShell>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Abrir menu da conta" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Abrir menu da conta" }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("mounts at most one PWA install banner host under authenticated shell", () => {
    const { container } = render(
      <AppShell>
        <p>content</p>
      </AppShell>,
    );
    expect(container.querySelectorAll('[data-testid="pwa-install-banner"]')).toHaveLength(0);
    expect(screen.getAllByRole("link", { name: "Hoje" }).length).toBeGreaterThan(0);
  });
});
