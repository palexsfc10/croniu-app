import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("@/lib/clipboard", () => ({
  copyTextToClipboard: vi.fn(async () => ({ ok: true })),
}));

import { apiFetch } from "@/lib/api";
import { copyTextToClipboard } from "@/lib/clipboard";
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

  it("does not show the invite URL or raw token in the sheet", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ data: LINK, error: undefined, status: 200 });
    render(<ClientIntakeInviteButton clientId="c1" />);
    fireEvent.click(screen.getByRole("button", { name: "Enviar cadastro" }));
    await screen.findByRole("button", { name: "Enviar pelo WhatsApp" });
    expect(screen.queryByText(LINK.public_url)).not.toBeInTheDocument();
    expect(screen.queryByText(LINK.token)).not.toBeInTheDocument();
  });

  it("copies the same message baked into the WhatsApp link", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ data: LINK, error: undefined, status: 200 });
    render(<ClientIntakeInviteButton clientId="c1" />);
    fireEvent.click(screen.getByRole("button", { name: "Enviar cadastro" }));
    fireEvent.click(await screen.findByRole("button", { name: "Copiar convite" }));
    await waitFor(() => expect(copyTextToClipboard).toHaveBeenCalled());
    const copiedText = vi.mocked(copyTextToClipboard).mock.calls[0]![0];
    expect(copiedText).toContain(LINK.public_url);
    await screen.findByText("Convite copiado");
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
