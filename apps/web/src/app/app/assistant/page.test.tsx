import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (path: string) => {
    if (path.includes("/agent/status")) {
      return {
        data: {
          enabled: true,
          provider: "fake",
          model: "fake",
          tools: ["get_today_summary"],
          entitlement_ok: true,
        },
      };
    }
    if (path.endsWith("/agent/threads") && !path.includes("messages")) {
      return { data: { items: [] } };
    }
    return { data: null };
  }),
}));

import AssistantPage from "@/app/app/assistant/page";

describe("AssistantPage", () => {
  afterEach(() => cleanup());

  it("renders suggestions and confirmation-ready shell", async () => {
    render(<AssistantPage />);
    expect(await screen.findByRole("heading", { name: "Assistente" })).toBeInTheDocument();
    expect(screen.getByText(/Resuma meu dia/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Pergunte ou peça algo ao Croniu/i)).toBeInTheDocument();
  });
});
