import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const headersState = vi.hoisted(() => ({ host: "app.example.com" }));
const notFoundSpy = vi.hoisted(() => vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
}));

vi.mock("next/headers", () => ({
  headers: async () => new Map([["host", headersState.host]]),
}));

vi.mock("next/navigation", () => ({
  notFound: notFoundSpy,
}));

import DesignSystemPage from "@/app/app/dev/design-system/page";
import DesignSystemPageClient from "@/app/app/dev/design-system/design-system-client";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  notFoundSpy.mockClear();
  headersState.host = "app.example.com";
});

describe("DesignSystemPage — server-side gate, real 404 in PRD", () => {
  it("calls notFound() (a real 404, before any client JS ships) when neither signal matches", async () => {
    headersState.host = "app.croniu.com.br";
    vi.stubEnv("CRONIU_ENV", "");
    await expect(DesignSystemPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundSpy).toHaveBeenCalledTimes(1);
  });

  it("renders on an HML host even without CRONIU_ENV set (Host alone is sufficient)", async () => {
    headersState.host = "croniu-hml.ntws.cloud";
    vi.stubEnv("CRONIU_ENV", "");
    vi.stubGlobal("location", { ...window.location, hostname: "croniu-hml.ntws.cloud" });
    const jsx = await DesignSystemPage();
    render(jsx);
    expect(notFoundSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Design System Croniu" })).toBeInTheDocument();
  });

  it("renders when CRONIU_ENV=hml is set even on a non-matching host (env var alone is sufficient)", async () => {
    headersState.host = "app.example.com";
    vi.stubEnv("CRONIU_ENV", "hml");
    vi.stubGlobal("location", { ...window.location, hostname: "croniu-hml.ntws.cloud" });
    const jsx = await DesignSystemPage();
    render(jsx);
    expect(notFoundSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Design System Croniu" })).toBeInTheDocument();
  });
});

describe("DesignSystemPageClient — client-side secondary layer", () => {
  it("shows a plain 'not available' state on a non-HML, non-dev hostname", () => {
    render(<DesignSystemPageClient />);
    expect(screen.getByText("Não disponível")).toBeInTheDocument();
    expect(screen.queryByText("Design System Croniu")).not.toBeInTheDocument();
  });

  it("renders the full reference page on the HML hostname", () => {
    vi.stubGlobal("location", { ...window.location, hostname: "croniu-hml.ntws.cloud" });
    render(<DesignSystemPageClient />);
    expect(screen.getByText("Design System Croniu")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Design System Croniu" })).toBeInTheDocument();
  });
});
