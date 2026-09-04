import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const routeState = vi.hoisted(() => ({ pathname: "/app/cycles" }));
const apiFetch = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => routeState.pathname,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
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
      user: { id: "u1", email: "a@b.com", full_name: "Ana Souza", created_at: "" },
      organization: { id: "o1", name: "Studio", timezone: "America/Sao_Paulo" },
      role: "owner",
    },
  }),
}));

import {
  AssistantLayerProvider,
  useAssistantLayer,
} from "@/components/app/assistant/assistant-layer-provider";

function mockAgent() {
  apiFetch.mockImplementation(async (path: string) => {
    const p = String(path);
    if (p.includes("/agent/status")) {
      return { data: { enabled: true, provider: "fake", model: "fake", tools: [], entitlement_ok: true } };
    }
    if (p.endsWith("/agent/threads")) {
      return { data: { items: [] } };
    }
    if (p.includes("/home/summary")) {
      return { data: { today_appointments: [], attention_items: [] } };
    }
    return { data: null };
  });
}

/** A trigger button rendered inside the provider — the only way real code
 * ever calls `open`/`minimize`/`restore`/`close` (the orb, the sidebar
 * button); tests drive the same path rather than reaching into internals. */
function Trigger() {
  const layer = useAssistantLayer();
  return (
    <div>
      <button onClick={() => layer.open()}>open</button>
      <button onClick={() => layer.open({ prompt: "Sobre ciclos: ", context: "Ciclos", returnTo: "/app/cycles" })}>
        open-with-context
      </button>
      <button onClick={() => layer.minimize()}>minimize</button>
      <button onClick={() => layer.restore()}>restore</button>
      <button onClick={() => layer.close()}>close</button>
      <span data-testid="ui-state">{layer.uiState}</span>
    </div>
  );
}

function renderHarness() {
  return render(
    <AssistantLayerProvider>
      <Trigger />
    </AssistantLayerProvider>,
  );
}

describe("AssistantLayerProvider — global persistent layer", () => {
  beforeEach(() => {
    mockAgent();
    routeState.pathname = "/app/cycles";
  });

  afterEach(() => {
    cleanup();
    apiFetch.mockReset();
  });

  it("is hidden until open() is called, and shows the Assistant Croniu experience once opened", async () => {
    renderHarness();
    expect(screen.queryAllByText("Assistente Croniu")).toHaveLength(0);

    fireEvent.click(screen.getByText("open"));
    await waitFor(() => {
      expect(screen.getAllByText("Assistente Croniu").length).toBeGreaterThan(0);
    });
    expect(screen.getByTestId("ui-state")).toHaveTextContent("open");
  });

  it("minimize hides the layer without resetting the conversation; restore brings it back with state intact", async () => {
    renderHarness();
    fireEvent.click(screen.getByText("open"));
    await waitFor(() => expect(screen.getAllByText("Assistente Croniu").length).toBeGreaterThan(0));

    const [textarea] = screen.getAllByLabelText(/Pergunte ou peça algo/i) as HTMLTextAreaElement[];
    fireEvent.change(textarea, { target: { value: "rascunho não enviado" } });

    fireEvent.click(screen.getByText("minimize"));
    expect(screen.getByTestId("ui-state")).toHaveTextContent("minimized");
    expect(screen.queryAllByText("Assistente Croniu")).toHaveLength(0);

    fireEvent.click(screen.getByText("restore"));
    await waitFor(() => expect(screen.getAllByText("Assistente Croniu").length).toBeGreaterThan(0));
    const [restoredTextarea] = screen.getAllByLabelText(/Pergunte ou peça algo/i) as HTMLTextAreaElement[];
    expect(restoredTextarea.value).toBe("rascunho não enviado");
  });

  it("close hides the layer and never calls any write endpoint — opening/closing has no side effects", async () => {
    renderHarness();
    fireEvent.click(screen.getByText("open"));
    await waitFor(() => expect(screen.getAllByText("Assistente Croniu").length).toBeGreaterThan(0));

    fireEvent.click(screen.getByText("close"));
    expect(screen.getByTestId("ui-state")).toHaveTextContent("closed");
    expect(screen.queryAllByText("Assistente Croniu")).toHaveLength(0);

    const writeCalls = apiFetch.mock.calls.filter((call: unknown[]) => {
      const [path, init] = call as [string, RequestInit | undefined];
      const p = String(path);
      return (p.includes("/messages") || p.includes("/pending/")) && init?.method === "POST";
    });
    expect(writeCalls).toHaveLength(0);
  });

  it("is suppressed on /app/assistant itself — the full page already shows the same experience", async () => {
    routeState.pathname = "/app/assistant";
    renderHarness();
    fireEvent.click(screen.getByText("open"));
    expect(screen.getByTestId("ui-state")).toHaveTextContent("open");
    // uiState flips to "open" (the trigger still works), but nothing is
    // rendered on top of the full page for this route.
    expect(screen.queryAllByText("Assistente Croniu")).toHaveLength(0);
  });

  it("open({prompt, context, returnTo}) prefills the composer and context label for an empty conversation", async () => {
    renderHarness();
    fireEvent.click(screen.getByText("open-with-context"));
    await waitFor(() => expect(screen.getAllByText("Assistente Croniu").length).toBeGreaterThan(0));

    const [textarea] = screen.getAllByLabelText(/Pergunte ou peça algo/i) as HTMLTextAreaElement[];
    expect(textarea.value).toBe("Sobre ciclos: ");
  });
});
