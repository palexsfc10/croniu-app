import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BrandWordmark } from "@/components/brand";
import { AdminAuthScreen } from "@/components/auth/admin-auth-screen";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("Admin brand", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders Croniu wordmark with separate Admin label", () => {
    render(
      <AdminAuthScreen title="Entrar" subtitle="Sessão administrativa.">
        <p>form</p>
      </AdminAuthScreen>,
    );
    expect(screen.getByRole("img", { name: "Croniu" })).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.queryByText("Croniu Admin")).not.toBeInTheDocument();
  });

  it("keeps Admin outside the wordmark accessible name", () => {
    render(<BrandWordmark />);
    expect(screen.getByRole("img", { name: "Croniu" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Admin/i })).not.toBeInTheDocument();
  });
});
