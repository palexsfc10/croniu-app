import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BackLink } from "@/components/app/back-link";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("BackLink", () => {
  afterEach(() => cleanup());

  it("renders subtle arrow and destination label", () => {
    render(<BackLink href="/app/clients" label="Clientes" />);
    const link = screen.getByRole("link", { name: /Clientes/ });
    expect(link).toHaveAttribute("href", "/app/clients");
    expect(link.textContent).toMatch(/←/);
  });
});
