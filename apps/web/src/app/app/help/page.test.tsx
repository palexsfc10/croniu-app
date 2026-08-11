import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import HelpFeedbackPage from "@/app/app/help/page";

const apiFetch = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/help",
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/components/app/back-link", () => ({
  BackLink: () => <a href="/app/profile">Mais</a>,
}));

vi.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

describe("Help feedback form", () => {
  afterEach(() => {
    cleanup();
    apiFetch.mockReset();
  });

  it("requires category and message length", async () => {
    render(<HelpFeedbackPage />);
    fireEvent.click(screen.getByRole("button", { name: "Enviar feedback" }));
    expect(await screen.findByText(/Escolha um tipo/i)).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("submits feedback without mailto or support email", async () => {
    apiFetch.mockResolvedValueOnce({ data: { id: "f1", status: "new" }, status: 201 });
    render(<HelpFeedbackPage />);
    expect(document.body.innerHTML).not.toContain("mailto:");
    expect(document.body.innerHTML).not.toMatch(/@gmail\.com/i);
    fireEvent.click(screen.getByText("Sugestão"));
    fireEvent.change(screen.getByLabelText("Mensagem"), {
      target: { value: "Gostaria de um filtro por local na agenda." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar feedback" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
    const [url, init] = apiFetch.mock.calls[0];
    expect(url).toBe("/api/v1/feedback");
    const body = JSON.parse(init.body);
    expect(body.category).toBe("suggestion");
    expect(body.message.length).toBeGreaterThanOrEqual(10);
    expect(body).not.toHaveProperty("organization_id");
    expect(body).not.toHaveProperty("user_id");
    expect(await screen.findByText(/Feedback enviado/i)).toBeInTheDocument();
  });

  it("blocks double submit while busy", async () => {
    let resolve!: (v: unknown) => void;
    apiFetch.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    render(<HelpFeedbackPage />);
    fireEvent.click(screen.getByText("Problema"));
    fireEvent.change(screen.getByLabelText("Mensagem"), {
      target: { value: "Botão de salvar demora demais na agenda." },
    });
    const btn = screen.getByRole("button", { name: "Enviar feedback" });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(apiFetch).toHaveBeenCalledTimes(1);
    resolve({ data: { id: "f2" }, status: 201 });
    await screen.findByText(/Feedback enviado/i);
  });
});
