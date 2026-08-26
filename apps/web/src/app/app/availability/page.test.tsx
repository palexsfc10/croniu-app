import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AvailabilityPage from "@/app/app/availability/page";

const apiFetch = vi.fn();

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
  WEEKDAY_OPTIONS: [
    { value: 0, label: "Seg" },
    { value: 1, label: "Ter" },
    { value: 2, label: "Qua" },
    { value: 3, label: "Qui" },
    { value: 4, label: "Sex" },
    { value: 5, label: "Sáb" },
    { value: 6, label: "Dom" },
  ],
}));

describe("Availability settings page", () => {
  afterEach(() => {
    cleanup();
    apiFetch.mockReset();
  });

  it("shows the not-configured default week and explains the feature", async () => {
    apiFetch.mockResolvedValueOnce({ data: { configured: false, days: [] }, status: 200 });
    render(<AvailabilityPage />);
    expect(
      await screen.findByRole("heading", { name: "Horários de atendimento" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/identifique vagas disponíveis/i)).toBeInTheDocument();
    expect(screen.queryByText("Configurado")).not.toBeInTheDocument();
    expect(screen.getAllByText("Atende")).toHaveLength(7);
    // Weekend defaults to off
    expect(screen.getAllByText("Sem atendimento neste dia.")).toHaveLength(2);
  });

  it("toggling a day off hides its time inputs", async () => {
    apiFetch.mockResolvedValueOnce({ data: { configured: false, days: [] }, status: 200 });
    render(<AvailabilityPage />);
    await screen.findByRole("heading", { name: "Horários de atendimento" });
    const toggles = screen.getAllByLabelText("Atende");
    fireEvent.click(toggles[0]); // Segunda off
    expect(screen.getAllByText("Sem atendimento neste dia.")).toHaveLength(3);
  });

  it("applying Monday to weekdays copies its config to Tue–Fri", async () => {
    apiFetch.mockResolvedValueOnce({ data: { configured: false, days: [] }, status: 200 });
    render(<AvailabilityPage />);
    await screen.findByRole("heading", { name: "Horários de atendimento" });
    const startInputs = screen.getAllByLabelText("Início") as HTMLInputElement[];
    fireEvent.change(startInputs[0], { target: { value: "07:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar segunda aos dias úteis" }));
    const startInputsAfter = screen.getAllByLabelText("Início") as HTMLInputElement[];
    // Mon–Fri (first 5 rows) now all start at 07:00
    for (const input of startInputsAfter.slice(0, 5)) {
      expect(input.value).toBe("07:00");
    }
  });

  it("saves the full week and shows success feedback", async () => {
    apiFetch.mockResolvedValueOnce({ data: { configured: false, days: [] }, status: 200 });
    render(<AvailabilityPage />);
    await screen.findByRole("heading", { name: "Horários de atendimento" });

    apiFetch.mockResolvedValueOnce({
      data: { configured: true, days: [] },
      status: 200,
    });
    fireEvent.click(screen.getByRole("button", { name: /Salvar horários/i }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
    const [url, init] = apiFetch.mock.calls[1];
    expect(url).toBe("/api/v1/availability/settings");
    expect(init.method).toBe("PUT");
    const body = JSON.parse(init.body);
    expect(body.days).toHaveLength(7);
    expect(await screen.findByText("Horários salvos.")).toBeInTheDocument();
    expect(screen.getByText("Configurado")).toBeInTheDocument();
  });

  it("shows an error message when saving fails", async () => {
    apiFetch.mockResolvedValueOnce({ data: { configured: false, days: [] }, status: 200 });
    render(<AvailabilityPage />);
    await screen.findByRole("heading", { name: "Horários de atendimento" });

    apiFetch.mockResolvedValueOnce({
      error: { code: "validation_error", message: "Dados inválidos." },
      status: 422,
    });
    fireEvent.click(screen.getByRole("button", { name: /Salvar horários/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Dados inválidos.");
  });
});
