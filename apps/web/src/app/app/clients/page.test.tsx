import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Client, IntakeLink, ProfessionProfile } from "@/lib/api";

const copyTextToClipboard = vi.fn();

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("@/lib/clipboard", () => ({
  copyTextToClipboard: (...args: unknown[]) => copyTextToClipboard(...args),
}));

import { apiFetch } from "@/lib/api";
import ClientsPage from "@/app/app/clients/page";

const profession: ProfessionProfile = {
  profession_code: "personal_trainer",
} as ProfessionProfile;

const noActiveLink: IntakeLink = { has_active_link: false };

const activeLink: IntakeLink = {
  has_active_link: true,
  id: "link-1",
  token: "l1.abc123",
  public_path: "/entrar/l1.abc123",
  public_url: "https://app.croniu.com.br/entrar/l1.abc123",
  wa_message_url:
    "https://wa.me/?text=" +
    encodeURIComponent(
      "Olá! Para facilitar seu acompanhamento, preencha seu cadastro no Croniu pelo link abaixo:\nhttps://app.croniu.com.br/entrar/l1.abc123",
    ),
};

function mockApi({
  clients = [],
  link = noActiveLink,
  createResult = activeLink,
}: {
  clients?: Client[];
  link?: IntakeLink;
  createResult?: IntakeLink;
} = {}) {
  vi.mocked(apiFetch).mockImplementation(async (path: string, init?: RequestInit) => {
    if (path.startsWith("/api/v1/clients?")) return { data: clients, error: undefined, status: 200 };
    if (path === "/api/v1/organization/profession")
      return { data: profession, error: undefined, status: 200 };
    if (path === "/api/v1/cycles") return { data: [], error: undefined, status: 200 };
    if (path === "/api/v1/home/summary")
      return {
        data: { local_today: "2026-08-21", new_submissions_count: 0 },
        error: undefined,
        status: 200,
      };
    if (path === "/api/v1/intake-link" && (!init || init.method === undefined)) {
      await new Promise((r) => setTimeout(r, 10));
      return { data: link, error: undefined, status: 200 };
    }
    if (path === "/api/v1/intake-link" && init?.method === "POST") {
      await new Promise((r) => setTimeout(r, 10));
      return { data: createResult, error: undefined, status: 200 };
    }
    return { data: null, error: { code: "not_found", message: "unexpected path" }, status: 404 };
  });
}

describe("ClientsPage — invite flow", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    copyTextToClipboard.mockReset();
    vi.spyOn(window, "open").mockImplementation(() => null);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows a single invite action, no duplicates, when the list is empty", async () => {
    mockApi({ clients: [] });
    render(<ClientsPage />);

    await screen.findByText("Nenhum aluno cadastrado");
    expect(screen.getAllByRole("button", { name: "Convidar aluno" })).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: /Adicionar aluno/i })).toHaveLength(1);
    expect(screen.queryByText(/Crie o link/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/Cadastre um aluno manualmente ou envie um convite/i),
    ).toBeInTheDocument();
  });

  it("still shows the invite action when there are students", async () => {
    mockApi({
      clients: [
        { id: "c1", full_name: "Ana Aluna", phone: null, email: null, notes: null, status: "active", created_at: "" } as Client,
      ],
    });
    render(<ClientsPage />);
    await screen.findByText("Ana Aluna");
    expect(screen.getByRole("button", { name: "Convidar aluno" })).toBeInTheDocument();
  });

  it("reuses an existing link without ever asking to create one", async () => {
    mockApi({ link: activeLink });
    render(<ClientsPage />);
    await screen.findByRole("button", { name: "Convidar aluno" });

    fireEvent.click(screen.getByRole("button", { name: "Convidar aluno" }));

    await screen.findByText(activeLink.public_url!);
    expect(screen.queryByText(/Crie o link/i)).not.toBeInTheDocument();
    expect(
      vi.mocked(apiFetch).mock.calls.filter(([path, init]) => path === "/api/v1/intake-link" && (init as RequestInit | undefined)?.method === "POST"),
    ).toHaveLength(0);
  });

  it("creates the link automatically when none exists yet, with no 'create link' wording", async () => {
    mockApi({ link: noActiveLink, createResult: activeLink });
    render(<ClientsPage />);
    await screen.findByRole("button", { name: "Convidar aluno" });

    fireEvent.click(screen.getByRole("button", { name: "Convidar aluno" }));
    expect(await screen.findByText("Preparando convite…")).toBeInTheDocument();

    await screen.findByText(activeLink.public_url!);
    expect(screen.queryByText(/criar link/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/link ainda não criado/i)).not.toBeInTheDocument();
  });

  it("does not fire a second create request on rapid repeated taps", async () => {
    mockApi({ link: noActiveLink, createResult: activeLink });
    render(<ClientsPage />);
    const trigger = await screen.findByRole("button", { name: "Convidar aluno" });

    fireEvent.click(trigger);
    fireEvent.click(trigger);
    fireEvent.click(trigger);

    await screen.findByText(activeLink.public_url!);
    const postCalls = vi
      .mocked(apiFetch)
      .mock.calls.filter(
        ([path, init]) => path === "/api/v1/intake-link" && (init as RequestInit | undefined)?.method === "POST",
      );
    expect(postCalls).toHaveLength(1);
  });

  it("sends the exact same URL via WhatsApp and copy", async () => {
    mockApi({ link: activeLink });
    render(<ClientsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Convidar aluno" }));
    await screen.findByText(activeLink.public_url!);

    copyTextToClipboard.mockResolvedValue({ ok: true });
    fireEvent.click(screen.getByRole("button", { name: "Copiar convite" }));
    await waitFor(() => expect(copyTextToClipboard).toHaveBeenCalled());
    const copiedText = copyTextToClipboard.mock.calls[0][0] as string;
    expect(copiedText).toContain(activeLink.public_url);

    fireEvent.click(screen.getByRole("button", { name: "Enviar pelo WhatsApp" }));
    expect(window.open).toHaveBeenCalledWith(
      activeLink.wa_message_url,
      "_blank",
      "noopener,noreferrer",
    );
    const waText = decodeURIComponent(activeLink.wa_message_url!.split("text=")[1]!);
    expect(waText).toContain(activeLink.public_url);
    expect(waText).toBe(copiedText);
  });

  it("shows 'Convite copiado' confirmation after copying", async () => {
    mockApi({ link: activeLink });
    copyTextToClipboard.mockResolvedValue({ ok: true });
    render(<ClientsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Convidar aluno" }));
    await screen.findByText(activeLink.public_url!);

    fireEvent.click(screen.getByRole("button", { name: "Copiar convite" }));
    expect(await screen.findByText("Convite copiado")).toBeInTheDocument();
  });

  it("shows a human error and retry action when the invite cannot be prepared, without opening WhatsApp", async () => {
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      if (path.startsWith("/api/v1/clients?")) return { data: [], error: undefined, status: 200 };
      if (path === "/api/v1/organization/profession")
        return { data: profession, error: undefined, status: 200 };
      if (path === "/api/v1/cycles") return { data: [], error: undefined, status: 200 };
      if (path === "/api/v1/home/summary")
        return {
          data: { local_today: "2026-08-21", new_submissions_count: 0 },
          error: undefined,
          status: 200,
        };
      if (path === "/api/v1/intake-link")
        return { data: null, error: { code: "server_error", message: "boom" }, status: 500 };
      return { data: null, error: { code: "not_found", message: "unexpected" }, status: 404 };
    });
    render(<ClientsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Convidar aluno" }));

    expect(
      await screen.findByText("Não foi possível preparar o convite. Tente novamente."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enviar pelo WhatsApp" })).not.toBeInTheDocument();
    expect(window.open).not.toHaveBeenCalled();
  });

  it("exposes the invite trigger and panel with accessible roles", async () => {
    mockApi({ link: activeLink });
    render(<ClientsPage />);
    const trigger = await screen.findByRole("button", { name: "Convidar aluno" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByRole("dialog", { name: "Convide um aluno" })).toBeInTheDocument();
  });
});
