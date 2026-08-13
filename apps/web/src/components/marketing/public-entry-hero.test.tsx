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
  it("renders modern copy, CTAs, logo and a single H1", () => {
    render(<PublicEntryHero />);

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent(/Organize seus clientes/i);
    expect(headings[0]).toHaveTextContent(/Simplifique sua rotina/i);

    expect(
      screen.getByText(/Cadastros, agenda, planos, ciclos e acompanhamentos/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Seu parceiro de rotina")).toBeInTheDocument();

    const register = screen.getByRole("link", { name: "Criar minha conta" });
    const login = screen.getByRole("link", { name: "Já tenho uma conta" });
    expect(register).toHaveAttribute("href", "/register");
    expect(login).toHaveAttribute("href", "/login");

    expect(screen.getByRole("img", { name: "Croniu" })).toBeInTheDocument();
    expect(screen.queryByText(/Sua rotina\. Seus ciclos/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Começar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Entrar" })).not.toBeInTheDocument();

    expect(screen.getByText("Clientes organizados")).toBeInTheDocument();
    expect(screen.getByText("Rotina sob controle")).toBeInTheDocument();
    expect(screen.getByText("IA no dia a dia")).toBeInTheDocument();
    expect(screen.getByText("© Croniu")).toBeInTheDocument();
  });

  it("preserves safe next param on auth CTAs", () => {
    render(<PublicEntryHero next="/app/clients" />);
    expect(screen.getByRole("link", { name: "Criar minha conta" })).toHaveAttribute(
      "href",
      "/register?next=%2Fapp%2Fclients",
    );
    expect(screen.getByRole("link", { name: "Já tenho uma conta" })).toHaveAttribute(
      "href",
      "/login?next=%2Fapp%2Fclients",
    );
  });

  it("keeps product preview decorative and free of personal data", () => {
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
    expect(container.querySelectorAll(".public-entry-card").length).toBeGreaterThanOrEqual(3);
  });
});
