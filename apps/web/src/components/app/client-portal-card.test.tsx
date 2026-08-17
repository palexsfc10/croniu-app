import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientAccess } from "@/lib/api";

const copyTextToClipboard = vi.fn();

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("@/lib/clipboard", () => ({
  copyTextToClipboard: (...args: unknown[]) => copyTextToClipboard(...args),
}));

import { apiFetch } from "@/lib/api";
import { ClientPortalCard } from "@/components/app/client-portal-card";

const active: ClientAccess = {
  has_active_link: true,
  created_at: "2026-08-10T12:00:00.000Z",
  last_used_at: null,
  public_path: "/c/v1.abc",
  public_url: "https://app.example/c/v1.abc",
  wa_message_template:
    "Olá, Renata. Aqui está seu acesso ao Croniu para acompanhar sua agenda, ciclo e conteúdos publicados:\n\nhttps://app.example/c/v1.abc",
};

describe("ClientPortalCard", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  beforeEach(() => {
    copyTextToClipboard.mockReset();
    vi.mocked(apiFetch).mockReset();
  });

  it("shows the empty card with create CTA", () => {
    render(
      <ClientPortalCard
        clientId="c1"
        firstName="Renata"
        phone="11988887777"
        access={{ has_active_link: false }}
        onAccessChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("heading", { name: "Portal do cliente" })).toBeInTheDocument();
    expect(
      screen.getByText(/Compartilhe um acesso para que o cliente acompanhe agenda/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar acesso" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Copiar link/i })).not.toBeInTheDocument();
  });

  it("shows active access, dates, truncated URL and actions", () => {
    render(
      <ClientPortalCard
        clientId="c1"
        firstName="Renata"
        phone="11988887777"
        access={active}
        onAccessChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Acesso ativo")).toBeInTheDocument();
    expect(screen.getByText(/O cliente pode acompanhar as informações publicadas/i)).toBeInTheDocument();
    expect(screen.getByText(/Criado em:/i)).toBeInTheDocument();
    expect(screen.getByText("Ainda não acessado")).toBeInTheDocument();
    const url = screen.getByTestId("portal-url");
    expect(url).toHaveTextContent("https://app.example/c/v1.abc");
    expect(url.className).toContain("truncate");
    expect(screen.getByRole("button", { name: "Copiar link" })).toBeInTheDocument();
    const wa = screen.getByRole("link", { name: /Enviar pelo WhatsApp/i });
    expect(wa).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(decodeURIComponent(wa.getAttribute("href") || "")).toContain(
      "https://app.example/c/v1.abc",
    );
    expect(wa.getAttribute("href")).toContain("5511988887777");
    const open = screen.getByRole("link", { name: /Abrir portal/i });
    expect(open).toHaveAttribute("href", "/c/v1.abc");
    expect(open).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("shows last access timestamp when present", () => {
    render(
      <ClientPortalCard
        clientId="c1"
        firstName="Renata"
        phone={null}
        access={{ ...active, last_used_at: "2026-08-17T18:30:00.000Z" }}
        onAccessChange={vi.fn()}
      />,
    );
    expect(screen.queryByText("Ainda não acessado")).not.toBeInTheDocument();
    expect(screen.getByText(/às/)).toBeInTheDocument();
  });

  it("copies after a GET-loaded URL without creating a new link", async () => {
    copyTextToClipboard.mockResolvedValue({ ok: true });
    render(
      <ClientPortalCard
        clientId="c1"
        firstName="Renata"
        phone={null}
        access={active}
        onAccessChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Copiar link" }));
    await waitFor(() => {
      expect(copyTextToClipboard).toHaveBeenCalledWith("https://app.example/c/v1.abc");
    });
    expect(apiFetch).not.toHaveBeenCalled();
    expect(await screen.findByText("Link copiado")).toBeInTheDocument();
  });

  it("uses clipboard fallback success without minting a new link", async () => {
    copyTextToClipboard.mockResolvedValue({ ok: true });
    render(
      <ClientPortalCard
        clientId="c1"
        firstName="Renata"
        phone={null}
        access={active}
        onAccessChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Copiar link" }));
    await waitFor(() => expect(copyTextToClipboard).toHaveBeenCalled());
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("shows copy error without generating a new link", async () => {
    copyTextToClipboard.mockResolvedValue({ ok: false, error: "denied" });
    render(
      <ClientPortalCard
        clientId="c1"
        firstName="Renata"
        phone={null}
        access={active}
        onAccessChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Copiar link" }));
    expect(await screen.findByText(/Não foi possível copiar automaticamente/i)).toBeInTheDocument();
    expect(screen.queryByText("Link copiado")).not.toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("requires confirmation before rotating", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ data: active, error: null } as never);
    render(
      <ClientPortalCard
        clientId="c1"
        firstName="Renata"
        phone={null}
        access={active}
        onAccessChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Mais opções"));
    fireEvent.click(screen.getByRole("button", { name: "Gerar novo link" }));
    const rotateDialog = screen.getByRole("dialog", { name: "Gerar um novo link?" });
    expect(rotateDialog).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Gerar novo link" }));
    fireEvent.click(
      screen.getByRole("dialog", { name: "Gerar um novo link?" }).querySelector("button")!,
    );
    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/v1/clients/c1/public-access/rotate",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("requires confirmation before revoking", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      data: { has_active_link: false },
      error: null,
    } as never);
    render(
      <ClientPortalCard
        clientId="c1"
        firstName="Renata"
        phone={null}
        access={active}
        onAccessChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Mais opções"));
    fireEvent.click(screen.getByRole("button", { name: "Desativar acesso" }));
    const revokeDialog = screen.getByRole("dialog", { name: "Desativar acesso?" });
    expect(revokeDialog).toBeInTheDocument();
    fireEvent.click(revokeDialog.querySelectorAll("button")[0]!);
    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/v1/clients/c1/public-access",
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });
});
