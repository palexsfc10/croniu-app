import { cleanup, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn();

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  nav.query = "";
});

const nav = vi.hoisted(() => ({ query: "" }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.query),
}));

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

  it("prefills the composer from ?prompt= without sending automatically (Perguntar sobre este cliente)", async () => {
    nav.query = "prompt=" + encodeURIComponent("Sobre Ana Martins: ");
    mockStatus();
    render(<AssistantPage />);

    const textbox = (await screen.findByLabelText(/Pergunte ou peça algo/i)) as HTMLTextAreaElement;
    expect(textbox.value).toBe("Sobre Ana Martins: ");
    // Prefilling is not sending — no message pipeline call should have fired.
    expect(
      apiFetch.mock.calls.some((call: unknown[]) => String(call[0]).includes("/messages")),
    ).toBe(false);
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

    const createCalls = apiFetch.mock.calls.filter(
      (c) => String(c[0]).endsWith("/agent/threads") && (c[1] as RequestInit | undefined)?.method === "POST",
    );
    expect(createCalls).toHaveLength(0);
  });

  it("does not create a thread on mount or listing", async () => {
    mockStatus();
    render(<AssistantPage />);
    await screen.findByRole("heading", { name: "Assistente" });
    await waitFor(() => {
      expect(apiFetch.mock.calls.some((c) => String(c[0]).includes("/agent/status"))).toBe(true);
    });
    await waitFor(() => {
      expect(
        apiFetch.mock.calls.some(
          (c) =>
            String(c[0]).endsWith("/agent/threads") &&
            (c[1] as RequestInit | undefined)?.method !== "POST",
        ),
      ).toBe(true);
    });
    const createCalls = apiFetch.mock.calls.filter(
      (c) => String(c[0]).endsWith("/agent/threads") && (c[1] as RequestInit | undefined)?.method === "POST",
    );
    expect(createCalls).toHaveLength(0);
  });

  it("does not auto-open an existing conversation on mount", async () => {
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
        throw new Error("must not create thread on mount");
      }
      if (String(path).endsWith("/agent/threads")) {
        return {
          data: {
            items: [
              {
                id: "thread-latest",
                title: "Dia",
                status: "active",
                created_at: "2026-08-01T10:00:00Z",
                updated_at: "2026-08-07T10:00:00Z",
              },
            ],
          },
        };
      }
      if (String(path).includes("/agent/threads/thread-latest")) {
        throw new Error("must not auto-open latest thread on mount");
      }
      return { data: null };
    });

    render(<AssistantPage />);
    expect(await screen.findByText("O que vamos organizar hoje?")).toBeInTheDocument();
    expect(screen.queryByText(/Seu dia está livre/i)).not.toBeInTheDocument();
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

  it("keeps executed proposal without buttons after reopening the conversation", async () => {
    const pending = {
      id: "pending-executed-1",
      tool_name: "propose_create_client",
      risk_class: "write_common",
      summary: "Criar cliente Ana.",
      summary_fields: { Nome: "Ana" },
      arguments: { full_name: "Ana" },
      expires_at: new Date(Date.now() + 600_000).toISOString(),
      status: "pending",
    };
    let detailLoads = 0;

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
            id: "thread-reload",
            title: "Criar",
            status: "active",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        };
      }
      if (String(path).endsWith("/agent/threads") && !String(path).includes("messages")) {
        return {
          data: {
            items: [
              {
                id: "thread-reload",
                title: "Criar",
                status: "active",
                created_at: "2026-08-07T10:00:00Z",
                updated_at: "2026-08-07T10:05:00Z",
              },
            ],
          },
        };
      }
      if (String(path).includes("/messages")) {
        return {
          data: {
            reply: "Preciso da sua confirmação.",
            status: "awaiting_confirmation",
            thread_id: "thread-reload",
            pending_action: pending,
          },
        };
      }
      if (String(path).includes("/pending/") && String(path).includes("/confirm")) {
        return {
          data: {
            reply: "Pronto.",
            status: "executed",
            action_status: "executed",
            pending_action: { ...pending, status: "executed" },
            thread_id: "thread-reload",
          },
        };
      }
      if (String(path).includes("/agent/threads/thread-reload")) {
        detailLoads += 1;
        const status = detailLoads === 1 ? "pending" : "executed";
        return {
          data: {
            thread: {
              id: "thread-reload",
              title: "Criar",
              status: "active",
              created_at: "2026-08-07T10:00:00Z",
              updated_at: "2026-08-07T10:05:00Z",
            },
            messages: [
              {
                id: "m-card",
                role: "assistant",
                content: "Criar cliente Ana.",
                message_type: "pending_card",
                metadata_safe: {
                  pending_action_id: pending.id,
                  tool_name: pending.tool_name,
                  summary_fields: pending.summary_fields,
                  // Stale snapshot on purpose for reload #2 — live pending_action wins.
                  pending_action: {
                    ...pending,
                    status,
                  },
                },
              },
            ],
          },
        };
      }
      return { data: null };
    });

    render(<AssistantPage />);
    expect(await screen.findByText("O que vamos organizar hoje?")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Conversas"));
    const openDialog = await screen.findByRole("dialog", { name: /Conversas recentes/i });
    fireEvent.click(within(openDialog).getByText(/Criar/i));

    expect(await screen.findByText("Aguardando sua confirmação")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    // Scoped to the proposal card itself — the desktop "Atividade recente"
    // panel now also echoes "Ação concluída" for the same action, so a
    // page-wide query would be ambiguous.
    const card = await screen.findByRole("region", { name: /Proposta:/i });
    expect(await within(card).findByText("Ação concluída")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirmar" })).not.toBeInTheDocument();

    // Simulate leave/reopen via Conversas → same thread
    fireEvent.click(screen.getByLabelText("Conversas"));
    const dialog = await screen.findByRole("dialog", { name: /Conversas recentes/i });
    fireEvent.click(within(dialog).getByText(/Criar/i));

    const reopenedCard = await screen.findByRole("region", { name: /Proposta:/i });
    expect(await within(reopenedCard).findByText("Ação concluída")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirmar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancelar" })).not.toBeInTheDocument();
    expect(detailLoads).toBeGreaterThanOrEqual(2);
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

describe("AssistantPage desktop workspace — contexto, atalhos, atividade recente", () => {
  afterEach(() => {
    cleanup();
    apiFetch.mockReset();
  });

  it("shows a 'Contexto atual' panel with a real back-link when arriving from ?context=&returnTo= (Cliente 360°/Agenda entry points)", async () => {
    nav.query =
      "prompt=" +
      encodeURIComponent("Sobre Ana Martins: ") +
      "&context=" +
      encodeURIComponent("Cliente: Ana Martins") +
      "&returnTo=" +
      encodeURIComponent("/app/clients/c1");
    mockStatus();
    render(<AssistantPage />);
    const panel = await screen.findByRole("complementary", { name: /Painel lateral/i });
    expect(within(panel).getByText("Contexto atual")).toBeInTheDocument();
    expect(within(panel).getByText("Cliente: Ana Martins")).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: "Voltar" })).toHaveAttribute(
      "href",
      "/app/clients/c1",
    );
  });

  it("does not show a context panel without ?context= — never invents one", async () => {
    mockStatus();
    render(<AssistantPage />);
    const panel = await screen.findByRole("complementary", { name: /Painel lateral/i });
    expect(within(panel).queryByText("Contexto atual")).not.toBeInTheDocument();
  });

  it("offers real Atalhos links to Agenda, Clientes and Rotinas pendentes", async () => {
    mockStatus();
    render(<AssistantPage />);
    const panel = await screen.findByRole("complementary", { name: /Painel lateral/i });
    expect(within(panel).getByRole("link", { name: /Agenda completa/i })).toHaveAttribute(
      "href",
      "/app/agenda",
    );
    expect(within(panel).getByRole("link", { name: /Rotinas pendentes/i })).toHaveAttribute(
      "href",
      "/app/routines/pending",
    );
  });

  it("lists a confirmed action in Atividade recente with a link to the real record", async () => {
    const pending = {
      id: "pend-recent",
      tool_name: "propose_cancel_appointment",
      summary: "Cancelar compromisso de Ana: hoje às 14h.",
      summary_fields: { Cliente: "Ana Martins" },
      arguments: { appointment_id: "appt-9" },
      expires_at: new Date(Date.now() + 600_000).toISOString(),
      status: "pending",
    };
    apiFetch.mockImplementation(async (path: string, init?: RequestInit) => {
      if (String(path).includes("/agent/status")) {
        return { data: { enabled: true, provider: "fake", model: "fake", tools: [], entitlement_ok: true } };
      }
      if (String(path) === "/api/v1/agent/threads" && init?.method === "POST") {
        return { data: { id: "t-recent", title: "Cancelar", status: "active", updated_at: "" } };
      }
      if (String(path).endsWith("/agent/threads") && !String(path).includes("messages")) {
        return { data: { items: [] } };
      }
      if (String(path).includes("/agent/threads") && String(path).endsWith("/messages")) {
        return {
          data: {
            reply: "Posso cancelar o compromisso das 14h?",
            status: "awaiting_confirmation",
            pending_action: pending,
            thread_id: "t-recent",
          },
        };
      }
      if (String(path).includes("/agent/pending/") && String(path).endsWith("/confirm")) {
        return {
          data: {
            reply: "Cancelado.",
            status: "ok",
            action_status: "executed",
            result: { id: "appt-9", kind: "appointment", status: "cancelled" },
          },
        };
      }
      return { data: null };
    });
    render(<AssistantPage />);
    const textbox = await screen.findByLabelText(/Pergunte ou peça algo/i);
    fireEvent.change(textbox, { target: { value: "Cancele o compromisso das 14h" } });
    fireEvent.submit(textbox.closest("form")!);
    await screen.findByRole("button", { name: "Confirmar" });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    const panel = screen.getByRole("complementary", { name: /Painel lateral/i });
    await waitFor(() => {
      expect(within(panel).getByText("Cancelar compromisso")).toBeInTheDocument();
    });
    expect(within(panel).getByRole("link", { name: "Abrir registro" })).toHaveAttribute(
      "href",
      "/app/appointments/appt-9",
    );
  });
});

describe("AssistantPage mobile — camada operacional (resumo, acesso rápido, consultas recentes)", () => {
  afterEach(() => {
    cleanup();
    apiFetch.mockReset();
  });

  it("shows a real day summary card from /home/summary, never a mocked count", async () => {
    apiFetch.mockImplementation(async (path: string) => {
      if (String(path).includes("/agent/status")) {
        return { data: { enabled: true, provider: "fake", model: "fake", tools: [], entitlement_ok: true } };
      }
      if (String(path).endsWith("/agent/threads")) return { data: { items: [] } };
      if (String(path).includes("/home/summary")) {
        return {
          data: {
            organization_id: "o1",
            timezone: "America/Sao_Paulo",
            local_today: "2026-08-14",
            today_appointments: [{ id: "a1" }, { id: "a2" }],
            cycles_nearing_end: [],
            renewals: [],
            pending_payments: [],
            attention_items: [{ id: "x1" }],
          },
        };
      }
      return { data: null };
    });
    render(<AssistantPage />);
    const summary = await screen.findByRole("link", { name: /2.*compromisso.*hoje.*1 pedindo atenção/i });
    expect(summary).toHaveAttribute("href", "/app/agenda");
  });

  it("offers quick-access chips to Agenda, Clientes and Rotinas", async () => {
    mockStatus();
    render(<AssistantPage />);
    await screen.findByText("O que vamos organizar hoje?");
    const quickAccess = screen.getByRole("group", { name: "Acesso rápido" });
    expect(within(quickAccess).getByRole("link", { name: /^Agenda$/ })).toHaveAttribute(
      "href",
      "/app/agenda",
    );
    expect(within(quickAccess).getByRole("link", { name: /^Clientes$/ })).toHaveAttribute(
      "href",
      "/app/clients",
    );
    expect(within(quickAccess).getByRole("link", { name: /^Rotinas$/ })).toHaveAttribute(
      "href",
      "/app/routines/pending",
    );
  });

  it("shows Consultas recentes chips from the already-loaded threads list (no separate fetch)", async () => {
    apiFetch.mockImplementation(async (path: string) => {
      if (String(path).includes("/agent/status")) {
        return { data: { enabled: true, provider: "fake", model: "fake", tools: [], entitlement_ok: true } };
      }
      if (String(path).endsWith("/agent/threads")) {
        return {
          data: {
            items: [
              { id: "t1", title: "Clientes em atenção hoje", status: "active", updated_at: "2026-08-14T10:00:00Z" },
            ],
          },
        };
      }
      return { data: null };
    });
    render(<AssistantPage />);
    expect(await screen.findByText("Consultas recentes")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Clientes em atenção hoje" }),
    ).toBeInTheDocument();
  });
});
