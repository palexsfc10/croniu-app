import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/organizations",
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/auth/admin-auth-provider", () => ({
  useAdminAuth: () => ({
    me: { id: "u1", email: "a@b.com", full_name: "Admin Croniu", role: "platform_admin", environment: "hml" },
    loading: false,
    logout: vi.fn(),
  }),
}));

import { AdminShell } from "@/components/admin-shell";

describe("AdminShell — mobile navigation drawer", () => {
  afterEach(() => {
    cleanup();
  });

  it("marks the active route with aria-current", () => {
    render(
      <AdminShell>
        <p>conteúdo</p>
      </AdminShell>,
    );
    const links = screen.getAllByRole("link", { name: "Organizações" });
    expect(links.some((link) => link.getAttribute("aria-current") === "page")).toBe(true);
  });

  it("opens the drawer from the mobile hamburger and closes it on Escape", () => {
    render(
      <AdminShell>
        <p>conteúdo</p>
      </AdminShell>,
    );

    expect(screen.queryByRole("dialog", { name: "Navegação" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Abrir navegação" }));
    expect(screen.getByRole("dialog", { name: "Navegação" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Navegação" })).not.toBeInTheDocument();
  });
});
