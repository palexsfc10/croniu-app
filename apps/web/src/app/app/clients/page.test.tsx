import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Client, IntakeLink, IntakeSubmissionListItem } from "@/lib/api";

const copyTextToClipboard = vi.fn();
const authState = vi.hoisted(() => ({ professionCode: "personal_trainer" as string | null }));

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("@/lib/clipboard", () => ({
  copyTextToClipboard: (...args: unknown[]) => copyTextToClipboard(...args),
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    me: {
      organization: { profession_code: authState.professionCode },
    },
  }),
}));

import { apiFetch } from "@/lib/api";
import ClientsPage from "@/app/app/clients/page";

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

function submission(id: string, full_name: string): IntakeSubmissionListItem {
  return {
    id,
    client_id: null,
    status: "pending_review",
    full_name,
    submitted_at: "2026-08-21T12:00:00.000Z",
    requires_professional_attention: false,
    duplicate_alert: false,
    archived_match: false,
    primary_goal: "Emagrecimento",
  };
}

function mockApi({
  clients = [],
  link = noActiveLink,
  createResult = activeLink,
  pending = [],
}: {
  clients?: Client[];
  link?: IntakeLink;
  createResult?: IntakeLink;
  pending?: IntakeSubmissionListItem[];
} = {}) {
  vi.mocked(apiFetch).mockImplementation(async (path: string, init?: RequestInit) => {
    if (path.startsWith("/api/v1/clients?")) return { data: clients, error: undefined, status: 200 };
    if (path === "/api/v1/cycles") return { data: [], error: undefined, status: 200 };
    if (path === "/api/v1/home/summary")
      return {
        data: { local_today: "2026-08-21", new_submissions_count: pending.length },
        error: undefined,
        status: 200,
      };
    if (path === "/api/v1/intake-submissions?status=pending_review")
      return { data: pending, error: undefined, status: 200 };
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

async function openInviteSheetAndWaitReady() {
  fireEvent.click(await screen.findByRole("button", { name: "Convidar aluno" }));
  await screen.findByRole("button", { name: "Enviar pelo WhatsApp" });
}

describe("ClientsPage — invite flow", () => {
  beforeEach(() => {
    authState.professionCode = "personal_trainer";
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

  it("reuses an existing link without ever asking to create one, and never shows the raw URL", async () => {
    mockApi({ link: activeLink });
    render(<ClientsPage />);
    await openInviteSheetAndWaitReady();

    expect(screen.queryByText(/Crie o link/i)).not.toBeInTheDocument();
    expect(screen.queryByText(activeLink.public_url!)).not.toBeInTheDocument();
    expect(
      vi.mocked(apiFetch).mock.calls.filter(([path, init]) => path === "/api/v1/intake-link" && (init as RequestInit | undefined)?.method === "POST"),
    ).toHaveLength(0);
  });

  it("creates the link automatically when none exists yet, with no 'create link' wording and no visible URL", async () => {
    mockApi({ link: noActiveLink, createResult: activeLink });
    render(<ClientsPage />);
    await screen.findByRole("button", { name: "Convidar aluno" });

    fireEvent.click(screen.getByRole("button", { name: "Convidar aluno" }));
    expect(await screen.findByText("Preparando convite…")).toBeInTheDocument();

    await screen.findByRole("button", { name: "Enviar pelo WhatsApp" });
    expect(screen.queryByText(/criar link/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/link ainda não criado/i)).not.toBeInTheDocument();
    expect(screen.queryByText(activeLink.public_url!)).not.toBeInTheDocument();
  });

  it("does not fire a second create request on rapid repeated taps", async () => {
    mockApi({ link: noActiveLink, createResult: activeLink });
    render(<ClientsPage />);
    const trigger = await screen.findByRole("button", { name: "Convidar aluno" });

    fireEvent.click(trigger);
    fireEvent.click(trigger);
    fireEvent.click(trigger);

    await screen.findByRole("button", { name: "Enviar pelo WhatsApp" });
    const postCalls = vi
      .mocked(apiFetch)
      .mock.calls.filter(
        ([path, init]) => path === "/api/v1/intake-link" && (init as RequestInit | undefined)?.method === "POST",
      );
    expect(postCalls).toHaveLength(1);
  });

  it("sends the exact same URL via WhatsApp and copy, without ever rendering the URL as text", async () => {
    mockApi({ link: activeLink });
    render(<ClientsPage />);
    await openInviteSheetAndWaitReady();

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
    expect(screen.queryByText(activeLink.public_url!)).not.toBeInTheDocument();
  });

  it("shows 'Convite copiado' confirmation after copying", async () => {
    mockApi({ link: activeLink });
    copyTextToClipboard.mockResolvedValue({ ok: true });
    render(<ClientsPage />);
    await openInviteSheetAndWaitReady();

    fireEvent.click(screen.getByRole("button", { name: "Copiar convite" }));
    expect(await screen.findByText("Convite copiado")).toBeInTheDocument();
  });

  it("shows a human error and retry action when the invite cannot be prepared, without opening WhatsApp", async () => {
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      if (path.startsWith("/api/v1/clients?")) return { data: [], error: undefined, status: 200 };
      if (path === "/api/v1/cycles") return { data: [], error: undefined, status: 200 };
      if (path === "/api/v1/home/summary")
        return {
          data: { local_today: "2026-08-21", new_submissions_count: 0 },
          error: undefined,
          status: 200,
        };
      if (path === "/api/v1/intake-submissions?status=pending_review")
        return { data: [], error: undefined, status: 200 };
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

describe("ClientsPage — pending intake discovery", () => {
  beforeEach(() => {
    authState.professionCode = "personal_trainer";
    vi.mocked(apiFetch).mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows no pending card when there are zero pending submissions", async () => {
    mockApi({ clients: [], pending: [] });
    render(<ClientsPage />);
    await screen.findByText("Nenhum aluno cadastrado");
    expect(screen.queryByText(/aguardando análise/i)).not.toBeInTheDocument();
  });

  it("shows a singular card with the submitter's name and links directly to it", async () => {
    mockApi({ clients: [], pending: [submission("sub-1", "Pedro Alves")] });
    render(<ClientsPage />);

    expect(await screen.findByText("Novo cadastro aguardando análise")).toBeInTheDocument();
    expect(
      screen.getByText("Pedro Alves enviou as informações para você analisar."),
    ).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: /Analisar cadastro/i });
    expect(cta).toHaveAttribute("href", "/app/clients/intake/sub-1");
  });

  it("shows a pluralized card and links to the pending queue for multiple submissions", async () => {
    mockApi({
      clients: [],
      pending: [submission("sub-1", "Pedro Alves"), submission("sub-2", "Ana Costa")],
    });
    render(<ClientsPage />);

    expect(await screen.findByText("2 cadastros aguardando análise")).toBeInTheDocument();
    expect(
      screen.getByText("Revise as informações enviadas pelos novos alunos."),
    ).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: /Ver cadastros/i });
    expect(cta).toHaveAttribute("href", "/app/clients/intake");
  });

  it("does not reserve blank space when there are no pending submissions", async () => {
    mockApi({ clients: [], pending: [] });
    const { container } = render(<ClientsPage />);
    await screen.findByText("Nenhum aluno cadastrado");
    expect(container.querySelector('a[href="/app/clients/intake"]')).not.toBeInTheDocument();
  });
});

describe("ClientsPage — nomenclature has no flash", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders 'Alunos' on the very first synchronous render for personal trainers, never 'Clientes'", () => {
    authState.professionCode = "personal_trainer";
    mockApi({ clients: [] });
    render(<ClientsPage />);

    // No `await`/`findBy` here on purpose: the profession is already known via
    // useAuth() on mount (AppShell only renders children after `me` loads), so
    // the correct term must be present in the very first render — not after a
    // page-local fetch resolves.
    expect(screen.getByRole("heading", { name: "Alunos" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Clientes" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Adicionar aluno/i })).toBeInTheDocument();
  });

  it("keeps 'Clientes' for a profession that isn't personal trainer, without forcing 'Alunos' globally", () => {
    authState.professionCode = "nutritionist";
    mockApi({ clients: [] });
    render(<ClientsPage />);

    expect(screen.getByRole("heading", { name: "Clientes" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Alunos" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Adicionar cliente/i })).toBeInTheDocument();
  });

  it("falls back to generic terms when the profession is still unknown, without ever showing the wrong specific term", () => {
    authState.professionCode = null;
    mockApi({ clients: [] });
    render(<ClientsPage />);

    // Generic "Clientes" is the correct neutral term here — it is never a
    // flash, because there is no later re-render that changes it once
    // profession_code stays unknown.
    expect(screen.getByRole("heading", { name: "Clientes" })).toBeInTheDocument();
  });

  it("lays the list out as a responsive grid from lg upward, single column below that", async () => {
    mockApi({
      clients: [
        { id: "c1", full_name: "Ana Aluna", phone: null, email: null, notes: null, status: "active", created_at: "" } as Client,
        { id: "c2", full_name: "Beto Aluno", phone: null, email: null, notes: null, status: "active", created_at: "" } as Client,
      ],
    });
    const { container } = render(<ClientsPage />);
    await screen.findByText("Ana Aluna");
    const list = container.querySelector("ul");
    expect(list).not.toBeNull();
    expect(list!.className).toContain("space-y-2.5");
    expect(list!.className).toContain("lg:grid");
    expect(list!.className).toContain("lg:grid-cols-2");
    expect(list!.className).toContain("xl:grid-cols-3");
  });
});
