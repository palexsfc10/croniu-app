import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { RoutePageviewTracker } from "@/components/analytics/route-pageview-tracker";

let pathname = "/register";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

function setLocation(href: string) {
  const url = new URL(href);
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      href: url.href,
      origin: url.origin,
      pathname: url.pathname,
      search: url.search,
    },
  });
}

describe("RoutePageviewTracker", () => {
  beforeEach(() => {
    window.dataLayer = undefined;
    pathname = "/register";
    setLocation("https://app.croniu.com.br/register?utm_source=instagram");
    Object.defineProperty(document, "referrer", { configurable: true, value: "" });
    document.title = "Criar conta";
  });

  afterEach(() => {
    cleanup();
  });

  it("fires exactly one page_view on initial load, preserving UTMs in page_location", () => {
    render(<RoutePageviewTracker />);
    expect(window.dataLayer).toEqual([
      {
        event: "page_view",
        page_location: "https://app.croniu.com.br/register?utm_source=instagram",
        page_path: "/register",
        page_title: "Criar conta",
        page_referrer: undefined,
      },
    ]);
  });

  it("does not push a second page_view on a re-render with the same pathname", () => {
    const { rerender } = render(<RoutePageviewTracker />);
    rerender(<RoutePageviewTracker />);
    expect(window.dataLayer).toHaveLength(1);
  });

  it("pushes a new page_view when the pathname actually changes", () => {
    const { rerender } = render(<RoutePageviewTracker />);
    pathname = "/app";
    setLocation("https://app.croniu.com.br/app");
    rerender(<RoutePageviewTracker />);
    expect(window.dataLayer).toHaveLength(2);
    expect((window.dataLayer as Array<Record<string, unknown>>)[1]).toMatchObject({
      event: "page_view",
      page_path: "/app",
    });
  });

  it("never fires page_view for /c/[token] (client portal)", () => {
    pathname = "/c/super-secret-token";
    setLocation("https://app.croniu.com.br/c/super-secret-token");
    render(<RoutePageviewTracker />);
    expect(window.dataLayer).toBeUndefined();
  });

  it("never fires page_view for /entrar/[token] (magic-link entry)", () => {
    pathname = "/entrar/super-secret-token";
    setLocation("https://app.croniu.com.br/entrar/super-secret-token");
    render(<RoutePageviewTracker />);
    expect(window.dataLayer).toBeUndefined();
  });

  it("drops a same-origin referrer that leaked a portal token", () => {
    Object.defineProperty(document, "referrer", {
      configurable: true,
      value: "https://app.croniu.com.br/c/super-secret-token",
    });
    render(<RoutePageviewTracker />);
    const pushed = (window.dataLayer as Array<Record<string, unknown>>)[0];
    expect(pushed.page_referrer).toBeUndefined();
  });

  it("keeps an ordinary cross-origin referrer (e.g. the institutional site)", () => {
    Object.defineProperty(document, "referrer", {
      configurable: true,
      value: "https://croniu.com.br/",
    });
    render(<RoutePageviewTracker />);
    const pushed = (window.dataLayer as Array<Record<string, unknown>>)[0];
    expect(pushed.page_referrer).toBe("https://croniu.com.br/");
  });
});
