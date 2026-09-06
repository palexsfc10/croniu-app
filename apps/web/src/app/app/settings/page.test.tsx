import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const logout = vi.fn();

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    me: { user: { full_name: "Ana Silva" }, organization: { name: "Studio Ana" } },
    logout,
  }),
}));

import SettingsHubPage from "@/app/app/settings/page";

describe("Central resumida de Conta e configurações", () => {
  afterEach(() => cleanup());

  it("links each item to its own screen, distinct domains never merged", () => {
    render(<SettingsHubPage />);
    expect(screen.getByRole("link", { name: /Minha conta/i })).toHaveAttribute(
      "href",
      "/app/settings/account",
    );
    expect(screen.getByRole("link", { name: /^Workspace/i })).toHaveAttribute(
      "href",
      "/app/settings/workspace",
    );
    expect(screen.getByRole("link", { name: /Disponibilidade/i })).toHaveAttribute(
      "href",
      "/app/settings/workspace#disponibilidade",
    );
    expect(screen.getByRole("link", { name: /Plano e assinatura/i })).toHaveAttribute(
      "href",
      "/app/settings/billing",
    );
    expect(screen.getByRole("link", { name: /Ajuda e privacidade/i })).toHaveAttribute(
      "href",
      "/app/settings/help",
    );
  });

  it("logs out when Sair is pressed", () => {
    render(<SettingsHubPage />);
    fireEvent.click(screen.getByRole("button", { name: /Sair/i }));
    expect(logout).toHaveBeenCalled();
  });
});
