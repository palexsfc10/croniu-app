import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const copyTextToClipboard = vi.fn();

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("@/lib/clipboard", () => ({
  copyTextToClipboard: (...args: unknown[]) => copyTextToClipboard(...args),
}));

import { apiFetch } from "@/lib/api";
import { ClientIntakeInviteButton } from "@/components/app/client-intake-invite-button";

const LINK = {
  client_id: "c1",
  full_name: "Sabrina Macedo",
  token: "ci1.aaaa.bbbb.cccc",
  public_path: "/entrar/ci1.aaaa.bbbb.cccc",
  public_url: "https://app.croniu.com.br/entrar/ci1.aaaa.bbbb.cccc",
  wa_message_url:
    "https://wa.me/?text=Ol%C3%A1%2C%20Sabrina%21%20Para%20facilitar...%0Ahttps%3A//app.croniu.com.br/entrar/ci1.aaaa.bbbb.cccc",
};

describe("ClientIntakeInviteButton", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("mints a contextual invite via POST /clients/{id}/intake-link on open", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ data: LINK, error: undefined, status: 200 });
    render(<ClientIntakeInviteButton clientId="c1" />);
    fireEvent.click(screen.getByRole("button", { name: "Enviar cadastro" }));
    await screen.findByRole("button", { name: "Enviar pelo WhatsApp" });
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/v1/clients/c1/intake-link",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("opens as a centered dialog, not a popover clipped to the trigger", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ data: LINK, error: undefined, status: 200 });
    render(<ClientIntakeInviteButton clientId="c1" />);
    fireEvent.click(screen.getByRole("button", { name: "Enviar cadastro" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("does not show the invite URL or raw token in the sheet", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ data: LINK, error: undefined, status: 200 });
    render(<ClientIntakeInviteButton clientId="c1" />);
    fireEvent.click(screen.getByRole("button", { name: "Enviar cadastro" }));
    await screen.findByRole("button", { name: "Enviar pelo WhatsApp" });
    expect(screen.queryByText(LINK.public_url)).not.toBeInTheDocument();
    expect(screen.queryByText(LINK.token)).not.toBeInTheDocument();
  });

  it("offers both Copiar link and Enviar pelo WhatsApp once the invite is ready", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ data: LINK, error: undefined, status: 200 });
    render(<ClientIntakeInviteButton clientId="c1" />);
    fireEvent.click(screen.getByRole("button", { name: "Enviar cadastro" }));
    await screen.findByRole("button", { name: "Enviar pelo WhatsApp" });
    expect(screen.getByRole("button", { name: "Copiar link" })).toBeInTheDocument();
  });

  it("copies the public intake link to the clipboard", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ data: LINK, error: undefined, status: 200 });
    copyTextToClipboard.mockResolvedValue({ ok: true });
    render(<ClientIntakeInviteButton clientId="c1" />);
    fireEvent.click(screen.getByRole("button", { name: "Enviar cadastro" }));
    const copyButton = await screen.findByRole("button", { name: "Copiar link" });
    fireEvent.click(copyButton);
    await screen.findByRole("button", { name: "Link copiado" });
    expect(copyTextToClipboard).toHaveBeenCalledWith(LINK.public_url);
  });

  it("shows an inline error and keeps the link selectable when the clipboard reports failure", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ data: LINK, error: undefined, status: 200 });
    copyTextToClipboard.mockResolvedValue({ ok: false, error: "clipboard_unavailable" });
    render(<ClientIntakeInviteButton clientId="c1" />);
    fireEvent.click(screen.getByRole("button", { name: "Enviar cadastro" }));
    const copyButton = await screen.findByRole("button", { name: "Copiar link" });
    fireEvent.click(copyButton);

    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível copiar o link");
    // Never silently declares success.
    expect(screen.queryByRole("button", { name: "Link copiado" })).not.toBeInTheDocument();
    // The link stays available as a manual fallback.
    const fallback = screen.getByRole("textbox", { name: "Endereço do link de cadastro" });
    expect(fallback).toHaveValue(LINK.public_url);
  });

  it("shows the same failure feedback when the clipboard Promise rejects instead of resolving with ok:false", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ data: LINK, error: undefined, status: 200 });
    copyTextToClipboard.mockRejectedValue(new Error("permission denied"));
    render(<ClientIntakeInviteButton clientId="c1" />);
    fireEvent.click(screen.getByRole("button", { name: "Enviar cadastro" }));
    const copyButton = await screen.findByRole("button", { name: "Copiar link" });
    fireEvent.click(copyButton);

    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível copiar o link");
    expect(screen.getByRole("textbox", { name: "Endereço do link de cadastro" })).toHaveValue(
      LINK.public_url,
    );
  });

  it("clears the previous failure once a retry actually copies successfully", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ data: LINK, error: undefined, status: 200 });
    copyTextToClipboard.mockResolvedValueOnce({ ok: false, error: "clipboard_unavailable" });
    copyTextToClipboard.mockResolvedValueOnce({ ok: true });
    render(<ClientIntakeInviteButton clientId="c1" />);
    fireEvent.click(screen.getByRole("button", { name: "Enviar cadastro" }));
    const copyButton = await screen.findByRole("button", { name: "Copiar link" });
    fireEvent.click(copyButton);
    await screen.findByRole("alert");

    fireEvent.click(screen.getByRole("button", { name: "Copiar link" }));
    await screen.findByRole("button", { name: "Link copiado" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("closes when clicking outside the sheet", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ data: LINK, error: undefined, status: 200 });
    render(<ClientIntakeInviteButton clientId="c1" />);
    fireEvent.click(screen.getByRole("button", { name: "Enviar cadastro" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(dialog.parentElement!);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ data: LINK, error: undefined, status: 200 });
    render(<ClientIntakeInviteButton clientId="c1" />);
    fireEvent.click(screen.getByRole("button", { name: "Enviar cadastro" }));
    await screen.findByRole("dialog");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not close when clicking inside the sheet content", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ data: LINK, error: undefined, status: 200 });
    render(<ClientIntakeInviteButton clientId="c1" />);
    fireEvent.click(screen.getByRole("button", { name: "Enviar cadastro" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(dialog);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows an error state and allows retry when minting fails", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      data: undefined,
      error: { code: "client_not_active", message: "Reative o cliente." },
      status: 422,
    });
    render(<ClientIntakeInviteButton clientId="c1" />);
    fireEvent.click(screen.getByRole("button", { name: "Enviar cadastro" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível preparar o convite.",
    );
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
  });
});
