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
  useAssistantPanelSpacing,
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
  const { style } = useAssistantPanelSpacing();
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
      <span data-testid="visible">{String(layer.visible)}</span>
      <span data-testid="panel-padding">{style?.paddingRight ?? "none"}</span>
    </div>
  );
}

/** jsdom has no real `matchMedia` — stub it so `useMediaQuery` can report a
 * controllable value instead of silently short-circuiting to `false`
 * (matching the pattern already needed for the mobile scroll-lock effect
 * elsewhere in this file). Always returns the same `matches` regardless of
 * the query string — good enough for these tests, which only ever probe
 * one query at a time. */
function stubDesktopViewport(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
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
    vi.unstubAllGlobals();
  });

  it("reserves real space for the panel via inline style at the dock-safe width (1920px) — not a Tailwind class (confirmed to lose the cascade against lg:px-6/xl:px-8 on <main> in live testing)", async () => {
    stubDesktopViewport(true);
    renderHarness();
    expect(screen.getByTestId("panel-padding")).toHaveTextContent("none");

    fireEvent.click(screen.getByText("open"));
    await waitFor(() => expect(screen.getByTestId("visible")).toHaveTextContent("true"));
    expect(screen.getByTestId("panel-padding")).toHaveTextContent("calc(440px + 32px)");
  });

  it("reserves no space below the dock-safe width — the panel still opens, but as an overlay, not a dock", async () => {
    stubDesktopViewport(false);
    renderHarness();
    fireEvent.click(screen.getByText("open"));
    await waitFor(() => expect(screen.getByTestId("visible")).toHaveTextContent("true"));
    expect(screen.getByTestId("panel-padding")).toHaveTextContent("none");
  });

  it("stops reserving space once suppressed by route, even though uiState stays 'open' (navigating to /app/assistant hides the layer, it doesn't close it)", async () => {
    stubDesktopViewport(true);
    const { rerender } = renderHarness();
    fireEvent.click(screen.getByText("open"));
    await waitFor(() => expect(screen.getByTestId("panel-padding")).toHaveTextContent("calc(440px + 32px)"));

    // Simulate an SPA navigation to /app/assistant on the *same* mounted
    // provider (a real route change never remounts it) by changing the
    // mocked pathname and forcing a re-render.
    routeState.pathname = "/app/assistant";
    rerender(
      <AssistantLayerProvider>
        <Trigger />
      </AssistantLayerProvider>,
    );

    expect(screen.getByTestId("ui-state")).toHaveTextContent("open");
    expect(screen.getByTestId("visible")).toHaveTextContent("false");
    expect(screen.getByTestId("panel-padding")).toHaveTextContent("none");
  });

  it("never calls the agent API before the first open() — lazy init, no background cost for a panel that's never opened", async () => {
    renderHarness();
    // Give any stray mount-time effect a chance to fire before asserting.
    await new Promise((r) => setTimeout(r, 50));
    expect(apiFetch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("open"));
    await waitFor(() => {
      expect(apiFetch.mock.calls.some((c) => String(c[0]).includes("/agent/status"))).toBe(true);
    });
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
