import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/app/app-shell";
import { apiFetch } from "@/lib/api";

const logout = vi.fn();
const routeState = vi.hoisted(() => ({ pathname: "/app" }));

// The sidebar's collapse/expand preference persists to localStorage — clear
// it after every test so one test's toggle never leaks into the next.
afterEach(() => {
  window.localStorage.clear();
});

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

/** Both the mobile-only header and the desktop-only topbar mount in every
 * test (jsdom doesn't apply the `lg:hidden` / `hidden lg:flex` media rules
 * that keep only one visible for a real user), each with its own avatar
 * trigger. Scoping by these stable classes — rather than `getByRole`
 * assuming a single match — is what lets each test target the instance
 * whose menu contents it actually cares about. */
function mobileHeader(container: HTMLElement) {
  return container.querySelector("header.app-topbar-mobile") as HTMLElement;
}
function desktopHeader(container: HTMLElement) {
  return container.querySelector("header.app-topbar-desktop") as HTMLElement;
}

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

  it("opens the mobile avatar menu with account, billing, preferences, help and logout", () => {
    const { container } = render(
      <AppShell>
        <p>content</p>
      </AppShell>,
    );
    const header = mobileHeader(container);
    fireEvent.click(within(header).getByRole("button", { name: "Abrir menu da conta" }));
    const menu = within(header).getByRole("menu", { name: "Conta" });
    expect(within(menu).getByRole("menuitem", { name: /Minha conta/i })).toHaveAttribute(
      "href",
      "/app/settings/account",
    );
    expect(within(menu).getByRole("menuitem", { name: /Workspace/i })).toHaveAttribute(
      "href",
      "/app/settings/workspace",
    );
    expect(within(menu).getByRole("menuitem", { name: /Assinatura/i })).toHaveAttribute(
      "href",
      "/app/settings/billing",
    );
    expect(within(menu).getByRole("menuitem", { name: /Preferências/i })).toHaveAttribute(
      "href",
      "/app/locations",
    );
    expect(within(menu).getByRole("menuitem", { name: /Ajuda e feedback/i })).toHaveAttribute(
      "href",
      "/app/settings/help",
    );
    expect(within(menu).getByRole("menuitem", { name: /Instalar Croniu/i })).toHaveAttribute(
      "href",
      "/app/profile#instalar-croniu",
    );
    expect(
      within(menu).queryByRole("menuitem", { name: /Meu link de indicação/i }),
    ).not.toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: /Design System/i })).not.toBeInTheDocument();
    expect(within(menu).queryByText("owner")).not.toBeInTheDocument();
    expect(within(menu).queryByText(/a@b\.com/)).not.toBeInTheDocument();
    fireEvent.click(within(menu).getByRole("menuitem", { name: /Sair/i }));
    expect(logout).toHaveBeenCalled();
  });

  it("opens the desktop avatar menu without a duplicate Ajuda row (that lives in the topbar's own Ajuda button) or Design System", () => {
    const { container } = render(
      <AppShell>
        <p>content</p>
      </AppShell>,
    );
    const header = desktopHeader(container);
    fireEvent.click(within(header).getByRole("button", { name: "Abrir menu da conta" }));
    const menu = within(header).getByRole("menu", { name: "Conta" });
    expect(within(menu).getByRole("menuitem", { name: /Minha conta/i })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /Workspace/i })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /Assinatura/i })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /Preferências/i })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /Instalar Croniu/i })).toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: /Ajuda e feedback/i })).not.toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: /Design System/i })).not.toBeInTheDocument();
  });

  it("closes avatar menu on outside click and Escape", () => {
    const { container } = render(
      <AppShell>
        <p>content</p>
      </AppShell>,
    );
    const header = mobileHeader(container);
    fireEvent.click(within(header).getByRole("button", { name: "Abrir menu da conta" }));
    expect(within(header).getByRole("menu")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(within(header).queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.click(within(header).getByRole("button", { name: "Abrir menu da conta" }));
    fireEvent.mouseDown(document.body);
    expect(within(header).queryByRole("menu")).not.toBeInTheDocument();
  });

  it("mounts at most one PWA install banner host under authenticated shell", () => {
    const { container } = render(
      <AppShell>
        <p>content</p>
      </AppShell>,
    );
    expect(container.querySelectorAll('[data-testid="pwa-install-banner"]')).toHaveLength(0);
    expect(screen.getAllByRole("link", { name: "Início" }).length).toBeGreaterThan(0);
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

    const { container } = render(
      <AppShell>
        <p>content</p>
      </AppShell>,
    );
    const header = mobileHeader(container);
    fireEvent.click(within(header).getByRole("button", { name: "Abrir menu da conta" }));
    const menu = within(header).getByRole("menu", { name: "Conta" });
    await waitFor(() => {
      expect(
        within(menu).getByRole("menuitem", { name: /Meu link de indicação/i }),
      ).toHaveAttribute("href", "/app/referrals");
    });
  });
});

describe("AppShell desktop topbar", () => {
  afterEach(() => {
    cleanup();
    routeState.pathname = "/app";
  });

  it("has a wide search entry that opens the same command palette as Ctrl+K, no separate search implementation", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    const { container } = render(
      <AppShell>
        <p>content</p>
      </AppShell>,
    );
    const header = desktopHeader(container);
    fireEvent.click(within(header).getByText(/Buscar clientes, telas ou perguntar à Cronia/i));
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: "croniu:open-command-palette" }),
    );
    dispatchSpy.mockRestore();
  });

  it("offers Novo cliente, Novo compromisso and Nova rotina from + Criar, no second creation flow", () => {
    const { container } = render(
      <AppShell>
        <p>content</p>
      </AppShell>,
    );
    const header = desktopHeader(container);
    fireEvent.click(within(header).getByRole("button", { name: "Criar" }));
    const menu = within(header).getByRole("menu", { name: "Criar" });
    expect(within(menu).getByRole("menuitem", { name: /Novo cliente/i })).toHaveAttribute(
      "href",
      "/app/clients/new",
    );
    expect(within(menu).getByRole("menuitem", { name: /Novo compromisso/i })).toHaveAttribute(
      "href",
      "/app/appointments/new",
    );
    expect(within(menu).getByRole("menuitem", { name: /Nova rotina/i })).toHaveAttribute(
      "href",
      "/app/routines?new=1",
    );
  });

  it("groups Manual, feedback/suporte and legal pages under Ajuda, with no sino/notificação", () => {
    const { container } = render(
      <AppShell>
        <p>content</p>
      </AppShell>,
    );
    const header = desktopHeader(container);
    fireEvent.click(within(header).getByRole("button", { name: "Ajuda" }));
    const menu = within(header).getByRole("menu", { name: "Ajuda" });
    expect(within(menu).getByRole("menuitem", { name: /Manual do Croniu/i })).toHaveAttribute(
      "href",
      "/app/manual",
    );
    expect(within(menu).getByRole("menuitem", { name: /Feedback e suporte/i })).toHaveAttribute(
      "href",
      "/app/settings/help",
    );
    expect(within(menu).getByRole("menuitem", { name: /Termos de uso/i })).toHaveAttribute(
      "href",
      "/termos",
    );
    expect(within(menu).getByRole("menuitem", { name: /Política de privacidade/i })).toHaveAttribute(
      "href",
      "/privacidade",
    );
    expect(container.querySelector('[aria-label*="notifica" i]')).toBeNull();
  });

  it("replaces the mobile 'IA' pill with a plain search entry — the bottom-nav orb is the mobile Cronia entry point", () => {
    const { container } = render(
      <AppShell>
        <p>content</p>
      </AppShell>,
    );
    const header = mobileHeader(container);
    expect(within(header).queryByText("IA")).not.toBeInTheDocument();
    expect(within(header).getByRole("button", { name: "Buscar" })).toBeInTheDocument();
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
    expect(bottomNav!.className).toContain("lg:hidden");
  });

  it("keeps the sidebar hidden on mobile/tablet and persistent from lg upward — same breakpoint every page's own content already switches at, so tablet widths never mix desktop chrome with mobile content", () => {
    const { container } = render(
      <AppShell>
        <p>content</p>
      </AppShell>,
    );
    const aside = container.querySelector("aside.app-sidebar");
    expect(aside).not.toBeNull();
    expect(aside!.className).toContain("hidden");
    expect(aside!.className).toContain("lg:flex");
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

  it("keeps every primary nav destination reachable, grouped under Principal/Trabalho/Gestão", () => {
    const { container } = render(
      <AppShell>
        <p>content</p>
      </AppShell>,
    );
    const expected = [
      "/app",
      "/app/agenda",
      "/app/clients",
      "/app/routines",
      "/app/accompaniment",
      "/app/cycles",
      "/app/receivables",
      "/app/services",
      "/app/profile",
    ];
    const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
    for (const href of expected) {
      expect(hrefs).toContain(href);
    }
    // Cronia is a global layer trigger now (opens the persistent
    // panel/overlay instead of navigating) — a button, not a link. The
    // route itself stays reachable as a full page/deep link; that's
    // covered by the Assistant page's own test suite.
    expect(screen.getAllByRole("button", { name: "Abrir a Cronia" }).length).toBeGreaterThan(0);

    const sidebar = container.querySelector("aside.app-sidebar") as HTMLElement;
    expect(within(sidebar).getByText("Principal")).toBeInTheDocument();
    expect(within(sidebar).getByText("Trabalho")).toBeInTheDocument();
    expect(within(sidebar).getByText("Gestão")).toBeInTheDocument();
    // The org/professional name is no longer permanently printed in the
    // sidebar — only inside the avatar menu.
    expect(within(sidebar).queryByText("Studio Alpha")).not.toBeInTheDocument();
    expect(within(sidebar).queryByRole("link", { name: /Minha conta/i })).not.toBeInTheDocument();
    expect(within(sidebar).queryByRole("link", { name: /Design System/i })).not.toBeInTheDocument();
  });

  it("collapses and expands the sidebar from its own footer control", () => {
    const { container } = render(
      <AppShell>
        <p>content</p>
      </AppShell>,
    );
    const sidebar = container.querySelector("aside.app-sidebar") as HTMLElement;
    const toggle = within(sidebar).getByRole("button", { name: "Recolher menu" });
    fireEvent.click(toggle);
    expect(within(sidebar).getByRole("button", { name: "Expandir menu" })).toBeInTheDocument();
    // Collapsed: group headers hide (no room for them), links stay
    // reachable (icon + hover tooltip carries the label instead).
    expect(within(sidebar).queryByText("Principal")).not.toBeInTheDocument();
    const collapsedHrefs = within(sidebar)
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));
    expect(collapsedHrefs).toContain("/app/clients");
  });
});
