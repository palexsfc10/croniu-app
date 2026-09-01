import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/app/app-shell";
import { apiFetch } from "@/lib/api";

const logout = vi.fn();
const routeState = vi.hoisted(() => ({ pathname: "/app" }));

vi.mock("next/navigation", () => ({
  usePathname: () => routeState.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (url: string) => {
    if (typeof url === "string" && url.includes("/referrals/me")) {
      return { data: { enabled: false, code: null, discount_percent: null, link: null }, status: 200 };
    }
    return {
      data: { has_active_access: true, can_write: true, billing_setup_status: "available" },
      status: 200,
    };
  }),
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
    routeState.pathname = "/app";
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
    expect(
      within(menu).queryByRole("menuitem", { name: /Meu link de indicação/i }),
    ).not.toBeInTheDocument();
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

  it("never shows the install banner outside the home screen, even with a captured native prompt", async () => {
    const { setDeferredInstallPrompt } = await import("@/lib/pwa-install");
    routeState.pathname = "/app/agenda";
    const { container } = render(
      <AppShell>
        <p>content</p>
      </AppShell>,
    );
    const event = new Event("beforeinstallprompt") as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: string; platform: string }>;
    };
    Object.assign(event, {
      prompt: vi.fn(async () => undefined),
      userChoice: Promise.resolve({ outcome: "accepted", platform: "web" }),
    });
    window.dispatchEvent(event);
    const { getDeferredInstallPrompt } = await import("@/lib/pwa-install");
    await waitFor(() => expect(getDeferredInstallPrompt()).not.toBeNull());
    // AppShell's own listener still captures the prompt (so the "Mais"
    // entry can use it later), but the banner itself must never render on
    // a non-home route.
    expect(container.querySelectorAll('[data-testid="pwa-install-banner"]')).toHaveLength(0);
    setDeferredInstallPrompt(null);
  });
});

describe("AppShell referral menu item", () => {
  afterEach(() => {
    cleanup();
    vi.mocked(apiFetch).mockClear();
  });

  it("shows 'Meu link de indicação' when the user is an enabled referral partner", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.includes("/referrals/me")) {
        return {
          data: { enabled: true, code: "PROMO10", discount_percent: 10, link: "https://x/register?ref=PROMO10" },
          status: 200,
        };
      }
      return {
        data: { has_active_access: true, can_write: true, billing_setup_status: "available" },
        status: 200,
      };
    });

    render(
      <AppShell>
        <p>content</p>
      </AppShell>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Abrir menu da conta" }));
    const menu = screen.getByRole("menu", { name: "Conta" });
    await waitFor(() => {
      expect(
        within(menu).getByRole("menuitem", { name: /Meu link de indicação/i }),
      ).toHaveAttribute("href", "/app/referrals");
    });
  });
});

describe("AppShell desktop workspace structure", () => {
  afterEach(() => {
    cleanup();
    logout.mockClear();
    routeState.pathname = "/app";
  });

  it("keeps the bottom tab bar mobile-only", () => {
    const { container } = render(
      <AppShell>
        <p>content</p>
      </AppShell>,
    );
    const bottomNav = container.querySelector("nav.app-bottom-nav");
    expect(bottomNav).not.toBeNull();
    expect(bottomNav!.className).toContain("md:hidden");
  });

  it("keeps the sidebar hidden on mobile and persistent from md upward", () => {
    const { container } = render(
      <AppShell>
        <p>content</p>
      </AppShell>,
    );
    const aside = container.querySelector("aside.app-sidebar");
    expect(aside).not.toBeNull();
    expect(aside!.className).toContain("hidden");
    expect(aside!.className).toContain("md:flex");
  });

  it("does not cap sidebar+content in one shared max-width (regression: that centered the whole shell and wasted the sides on wide screens instead of giving the sidebar+main a real workspace)", () => {
    const { container } = render(
      <AppShell>
        <p>content</p>
      </AppShell>,
    );
    const shellRoot = container.firstElementChild as HTMLElement;
    expect(shellRoot.className).not.toMatch(/max-w-6xl|max-w-7xl|max-w-\[90rem\]/);
    expect(shellRoot.className).toContain("w-full");
  });

  it("still renders the page content passed as children", async () => {
    render(
      <AppShell>
        <p>conteúdo da página</p>
      </AppShell>,
    );
    expect(await screen.findByText("conteúdo da página")).toBeInTheDocument();
  });

  it("keeps every primary nav destination reachable", () => {
    render(
      <AppShell>
        <p>content</p>
      </AppShell>,
    );
    const expected = [
      "/app",
      "/app/agenda",
      "/app/clients",
      "/app/routines",
      "/app/profile",
      "/app/assistant",
    ];
    const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
    for (const href of expected) {
      expect(hrefs).toContain(href);
    }
  });
});
