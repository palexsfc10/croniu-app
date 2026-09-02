import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { PublicEntryHero } from "@/components/marketing/public-entry-hero";
import { authHref, safeAuthNext } from "@/lib/public-entry";

describe("safeAuthNext", () => {
  it("accepts only same-app paths", () => {
    expect(safeAuthNext("/app")).toBe("/app");
    expect(safeAuthNext("/app/clients")).toBe("/app/clients");
    expect(safeAuthNext("https://evil.example/")).toBeNull();
    expect(safeAuthNext("//evil.example")).toBeNull();
    expect(safeAuthNext("/login")).toBeNull();
    expect(safeAuthNext("/register")).toBeNull();
  });
});

describe("authHref", () => {
  it("builds register and login links without external redirects", () => {
    expect(authHref("/register", null)).toBe("/register");
    expect(authHref("/login", "/app")).toBe("/login?next=%2Fapp");
    expect(authHref("/register", "https://evil.test")).toBe("/register");
  });
});

describe("PublicEntryHero", () => {
  it("renders the Workspace headline, CTAs, logo and a single H1", () => {
    const { container } = render(<PublicEntryHero />);

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent(/Administre seu trabalho/i);
    expect(headings[0]).toHaveTextContent(/com mais clareza/i);

    expect(
      screen.getByText(/Clientes, agenda, rotinas, financeiro e IA reunidos no Croniu Workspace/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Croniu Workspace")).toBeInTheDocument();
    expect(screen.getByText("Workspace")).toBeInTheDocument();
    expect(screen.getByText(/7 dias grátis/i)).toBeInTheDocument();

    const register = screen.getByRole("link", { name: "Começar grátis" });
    const login = screen.getByRole("link", { name: "Já possui uma conta? Entrar" });
    expect(register).toHaveAttribute("href", "/register");
    expect(login).toHaveAttribute("href", "/login");

    expect(screen.getByRole("img", { name: "Croniu" })).toBeInTheDocument();
    expect(container.querySelector('img[src="/brand/croniu-mark.png"]')).toBeNull();
    expect(screen.queryByText(/Sua rotina\. Seus ciclos/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Começar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Entrar" })).not.toBeInTheDocument();

    for (const area of ["Clientes", "Agenda", "Rotinas", "Financeiro", "IA"]) {
      expect(screen.getByText(area)).toBeInTheDocument();
    }
    expect(screen.getByText("© Croniu")).toBeInTheDocument();
  });

  it("preserves safe next param on auth CTAs", () => {
    render(<PublicEntryHero next="/app/clients" />);
    expect(screen.getByRole("link", { name: "Começar grátis" })).toHaveAttribute(
      "href",
      "/register?next=%2Fapp%2Fclients",
    );
    expect(screen.getByRole("link", { name: "Já possui uma conta? Entrar" })).toHaveAttribute(
      "href",
      "/login?next=%2Fapp%2Fclients",
    );
  });

  it("keeps the product preview decorative and free of personal data", () => {
    const { container } = render(<PublicEntryHero />);
    const preview = container.querySelector(".public-entry-preview");
    expect(preview).toHaveAttribute("aria-hidden", "true");
    expect(within(preview as HTMLElement).queryByText(/@|gmail|whatsapp|\+55/i)).toBeNull();
    expect(within(preview as HTMLElement).queryAllByRole("link")).toHaveLength(0);
    expect(within(preview as HTMLElement).queryAllByRole("button")).toHaveLength(0);
  });

  it("uses entrance animation classes that respect reduced-motion via globals", () => {
    const { container } = render(<PublicEntryHero />);
    expect(container.querySelector(".animate-fade-up")).toBeTruthy();
    expect(container.querySelector(".animate-fade-up-delay")).toBeTruthy();
    expect(container.querySelector(".public-entry-card")).toBeTruthy();
  });

  it("never uses the serif display class in the public entry", () => {
    const { container } = render(<PublicEntryHero />);
    expect(container.querySelector(".h-display-public")).toBeNull();
  });
});
