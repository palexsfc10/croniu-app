import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DesignSystemPage from "@/app/app/dev/design-system/page";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DesignSystemPage — never leaks into PRD", () => {
  it("shows a plain 'not available' state on a non-HML, non-dev hostname", () => {
    render(<DesignSystemPage />);
    expect(screen.getByText("Não disponível")).toBeInTheDocument();
    expect(screen.queryByText("Design System Croniu")).not.toBeInTheDocument();
  });

  it("renders the full reference page on the HML hostname", () => {
    vi.stubGlobal("location", { ...window.location, hostname: "croniu-hml.ntws.cloud" });
    render(<DesignSystemPage />);
    expect(screen.getByText("Design System Croniu")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Design System Croniu" })).toBeInTheDocument();
  });
});
