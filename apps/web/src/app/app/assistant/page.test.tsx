import { cleanup, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn();

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    me: {
      user: {
        id: "u1",
        email: "pedro@example.com",
        full_name: "Pedro Oliveira",
        created_at: "2026-01-01T00:00:00Z",
      },
      organization: {
        id: "o1",
        name: "Studio",
        timezone: "America/Sao_Paulo",
      },
      role: "owner",
    },
    loading: false,
    refresh: vi.fn(),
    logout: vi.fn(),
  }),
}));

import AssistantPage from "@/app/app/assistant/page";
import { personalGreeting } from "@/lib/greeting";

function mockStatus(extra: Record<string, unknown> = {}) {
  apiFetch.mockImplementation(async (path: string) => {
    if (String(path).includes("/agent/status")) {
      return {
        data: {
          enabled: true,
          provider: "fake",
          model: "fake",
          tools: ["get_today_summary"],
          entitlement_ok: true,
          voice_enabled: true,
          voice: { max_seconds: 60, max_bytes: 1_000_000, allowed_mime_types: ["audio/webm"] },
          ...extra,
        },
      };
    }
    if (String(path).endsWith("/agent/threads") && !String(path).includes("messages")) {
      return { data: { items: [] } };
    }
    return { data: null };
  });
}

describe("personalGreeting", () => {
  it("uses first name and org timezone hour", () => {
    // 2026-03-15 10:00 UTC = 07:00 America/Sao_Paulo → Bom dia
    const morning = new Date("2026-03-15T10:00:00.000Z");
    expect(personalGreeting("Pedro Oliveira", "America/Sao_Paulo", morning).headline).toBe(
      "Bom dia, Pedro",
    );

    const afternoon = new Date("2026-03-15T16:00:00.000Z"); // 13:00 BRT
    expect(personalGreeting("Ana Costa", "America/Sao_Paulo", afternoon).headline).toBe(
      "Boa tarde, Ana",
    );

    const night = new Date("2026-03-15T23:00:00.000Z"); // 20:00 BRT
    expect(personalGreeting("Maria", "America/Sao_Paulo", night).headline).toBe(
      "Boa noite, Maria",
    );
  });

  it("falls back to Olá without a name", () => {
    expect(personalGreeting(null, "America/Sao_Paulo").headline).toBe("Olá");
    expect(personalGreeting("  ", undefined).headline).toBe("Olá");
  });
});

describe("AssistantPage premium shell", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    apiFetch.mockReset();
  });

  it("shows compact header, personal greeting, and suggestion grid without brand marks", async () => {
    mockStatus();
    render(<AssistantPage />);

    expect(await screen.findByRole("heading", { name: "Assistente" })).toBeInTheDocument();
    expect(screen.getByLabelText("Voltar")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Nova conversa").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText("Conversas")).toBeInTheDocument();

    expect(screen.queryByText("Assistente Croniu")).not.toBeInTheDocument();
    expect(screen.queryByText(/^Voltar$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Enviar voz automaticamente:/i)).not.toBeInTheDocument();

    // Greeting uses mocked auth name (hour-dependent prefix)
    expect(screen.getByText(/Pedro/)).toBeInTheDocument();
    expect(screen.getByText("O que vamos organizar hoje?")).toBeInTheDocument();
    expect(screen.getByText(/Nada é alterado sem sua confirmação/i)).toBeInTheDocument();

    expect(screen.getByRole("button", { name: /Meu dia/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Clientes em atenção/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ciclos terminando/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Novo compromisso/i })).toBeInTheDocument();

    expect(screen.getByLabelText(/Pergunte ou peça algo/i)).toBeInTheDocument();
  });

  it("opens thread selector and starts a new conversation", async () => {
    mockStatus();
    render(<AssistantPage />);
    await screen.findByRole("heading", { name: "Assistente" });

    fireEvent.click(screen.getByLabelText("Conversas"));
    const dialog = await screen.findByRole("dialog", { name: /Conversas recentes/i });
    expect(within(dialog).getByRole("button", { name: /Nova conversa/i })).toBeInTheDocument();

    fireEvent.click(screen.getAllByLabelText("Nova conversa")[0]);
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /Conversas recentes/i })).not.toBeInTheDocument();
    });
  });

  it("sends suggestion through the chat pipeline and hides empty-state after start", async () => {
    apiFetch.mockImplementation(async (path: string, init?: RequestInit) => {
      if (String(path).includes("/agent/status")) {
        return {
          data: {
            enabled: true,
            provider: "fake",
            model: "fake",
            tools: [],
            entitlement_ok: true,
          },
        };
      }
      if (String(path).endsWith("/agent/threads") && init?.method === "POST") {
        return {
          status: 201,
          data: {
            id: "thread-1",
            title: null,
            status: "active",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        };
      }
      if (String(path).endsWith("/agent/threads") && !String(path).includes("messages")) {
        return { data: { items: [] } };
      }
      if (String(path).includes("/messages")) {
        return {
          data: {
            reply: "Seu dia está organizado.",
            status: "ok",
            thread_id: "thread-1",
          },
        };
      }
      return { data: null };
    });

    render(<AssistantPage />);
    const suggestion = await screen.findByRole("button", { name: /Meu dia/i });
    await waitFor(() => expect(suggestion).not.toBeDisabled());
    fireEvent.click(suggestion);

    expect(await screen.findByText(/Seu dia está organizado/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Meu dia/i })).not.toBeInTheDocument();
    expect(screen.queryByText("O que vamos organizar hoje?")).not.toBeInTheDocument();

    const messageCalls = apiFetch.mock.calls.filter((c) => String(c[0]).includes("/messages"));
    expect(messageCalls.length).toBeGreaterThanOrEqual(1);
    const body = JSON.parse(String((messageCalls[0][1] as RequestInit).body));
    expect(body.message).toMatch(/dia/i);
  });

  it("sends typed text and prevents duplicate concurrent sends", async () => {
    let resolveMsg: ((v: unknown) => void) | undefined;
    apiFetch.mockImplementation(async (path: string, init?: RequestInit) => {
      if (String(path).includes("/agent/status")) {
        return {
          data: {
            enabled: true,
            provider: "fake",
            model: "fake",
            tools: [],
            entitlement_ok: true,
          },
        };
      }
      if (String(path).endsWith("/agent/threads") && init?.method === "POST") {
        return {
          status: 201,
          data: {
            id: "thread-2",
            title: null,
            status: "active",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        };
      }
      if (String(path).endsWith("/agent/threads")) {
        return { data: { items: [] } };
      }
      if (String(path).includes("/messages")) {
        return await new Promise((resolve) => {
          resolveMsg = resolve;
        });
      }
      return { data: null };
    });

    render(<AssistantPage />);
    const input = await screen.findByLabelText(/Pergunte ou peça algo/i);
    await waitFor(() => expect(input).not.toBeDisabled());
    fireEvent.change(input, { target: { value: "Olá assistente" } });
    const sendBtn = screen.getByRole("button", { name: "Enviar mensagem" });
    fireEvent.click(sendBtn);
    fireEvent.click(sendBtn);

    await waitFor(() => {
      const calls = apiFetch.mock.calls.filter((c) => String(c[0]).includes("/messages"));
      expect(calls.length).toBe(1);
    });

    resolveMsg?.({
      data: { reply: "Oi!", status: "ok", thread_id: "thread-2" },
    });
    expect(await screen.findByText("Oi!")).toBeInTheDocument();
  });

  it("keeps confirmation UX for proposals", async () => {
    const pending = {
      id: "11111111-1111-1111-1111-111111111111",
      tool_name: "create_client",
      risk_class: "write_common",
      summary: "Criar cliente “Jose”.",
      summary_fields: { Cliente: "Jose" },
      arguments: { full_name: "Jose", phone: null, email: "a@b.com", notes: null },
      expires_at: new Date(Date.now() + 600_000).toISOString(),
      status: "pending",
    };

    apiFetch.mockImplementation(async (path: string, init?: RequestInit) => {
      if (String(path).includes("/agent/status")) {
        return {
          status: 200,
          data: {
            enabled: true,
            provider: "fake",
            model: "fake",
            tools: [],
            entitlement_ok: true,
          },
        };
      }
      if (String(path).endsWith("/agent/threads") && init?.method === "POST") {
        return {
          status: 201,
          data: {
            id: "22222222-2222-2222-2222-222222222222",
            title: null,
            status: "active",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        };
      }
      if (
        String(path).includes("/agent/threads") &&
        !String(path).includes("messages") &&
        !init?.method
      ) {
        return { status: 200, data: { items: [] } };
      }
      if (String(path).includes("/messages")) {
        return {
          status: 200,
          data: {
            reply: "Preciso da sua confirmação.",
            status: "awaiting_confirmation",
            pending_action: pending,
          },
        };
      }
      return { status: 200, data: null };
    });

    render(<AssistantPage />);
    const input = await screen.findByLabelText(/Pergunte ou peça algo/i);
    await waitFor(() => expect(input).not.toBeDisabled());
    fireEvent.change(input, { target: { value: "Cadastre um cliente" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar mensagem" }));

    expect(await screen.findAllByText(/Criar cliente/i)).not.toHaveLength(0);
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
  });

  it("exposes voice auto-send only via mic context menu", async () => {
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      get: () => true,
    });
    Object.defineProperty(window, "MediaRecorder", {
      writable: true,
      configurable: true,
      value: class {
        static isTypeSupported() {
          return true;
        }
      },
    });
    Object.defineProperty(navigator, "mediaDevices", {
      writable: true,
      configurable: true,
      value: { getUserMedia: vi.fn() },
    });
    mockStatus();
    render(<AssistantPage />);
    const mic = await screen.findByLabelText(/Gravar mensagem de voz/i);
    expect(screen.queryByText(/Enviar voz automaticamente:/i)).not.toBeInTheDocument();

    fireEvent.contextMenu(mic);
    expect(await screen.findByRole("menu", { name: /Opções de voz/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitemcheckbox", { name: /Enviar voz automaticamente/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Preferências/i })).toHaveAttribute(
      "href",
      "/app/preferences",
    );
  });
});
