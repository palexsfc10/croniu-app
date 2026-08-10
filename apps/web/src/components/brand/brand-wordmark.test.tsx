import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BrandWordmark } from "@/components/brand";
import { AuthScreen } from "@/components/auth/auth-screen";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("BrandWordmark", () => {
  afterEach(() => {
    cleanup();
  });

  it("exposes a single accessible name Croniu", () => {
    render(<BrandWordmark />);
    const mark = screen.getByRole("img", { name: "Croniu" });
    expect(mark).toBeInTheDocument();
    expect(mark.querySelector(".brand-wordmark__cron")).toHaveAttribute("aria-hidden", "true");
    expect(mark.querySelector(".brand-wordmark__iu")).toHaveAttribute("aria-hidden", "true");
    expect(mark.textContent).toBe("Croniu");
  });

  it("applies size and surface tokens without visual space between parts", () => {
    render(<BrandWordmark size="md" surface="light" data-testid="mark" />);
    const mark = screen.getByTestId("mark");
    expect(mark.className).toContain("brand-wordmark--md");
    expect(mark.className).toContain("brand-wordmark--on-light");
    expect(mark.textContent).not.toMatch(/Cron\s+iu/);
  });

  it("keeps Cron and iu as styled spans under one word", () => {
    render(<BrandWordmark />);
    const mark = screen.getByRole("img", { name: "Croniu" });
    const cron = mark.querySelector(".brand-wordmark__cron");
    const iu = mark.querySelector(".brand-wordmark__iu");
    expect(cron?.textContent).toBe("Cron");
    expect(iu?.textContent).toBe("iu");
  });
});

describe("AuthScreen brand placement", () => {
  afterEach(() => {
    cleanup();
  });

  it("places a single Croniu wordmark and left-aligned title on login", () => {
    render(
      <AuthScreen title="Entrar" subtitle="Acesse sua rotina com segurança.">
        <p>form</p>
      </AuthScreen>,
    );
    expect(screen.getAllByRole("img", { name: "Croniu" })).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Entrar" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Voltar" })).not.toBeInTheDocument();
  });

  it("places Voltar on the left and a single wordmark on register", () => {
    render(
      <AuthScreen title="Criar conta" backHref="/">
        <p>form</p>
      </AuthScreen>,
    );
    expect(screen.getByRole("link", { name: "Voltar" })).toHaveAttribute("href", "/");
    expect(screen.getAllByRole("img", { name: "Croniu" })).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Criar conta" })).toBeInTheDocument();
  });
});
