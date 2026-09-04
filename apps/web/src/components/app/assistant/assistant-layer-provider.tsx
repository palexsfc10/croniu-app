"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { personalGreeting } from "@/lib/greeting";
import { AssistantExperience } from "./assistant-experience";
import { useAssistantConversation } from "./use-assistant-conversation";

type UiState = "closed" | "open" | "minimized";

type OpenOptions = {
  prompt?: string;
  context?: string;
  returnTo?: string;
};

type AssistantLayerValue = {
  uiState: UiState;
  open: (opts?: OpenOptions) => void;
  minimize: () => void;
  restore: () => void;
  close: () => void;
};

const AssistantLayerContext = createContext<AssistantLayerValue | null>(null);

/** Read the global layer's open/minimize/restore/close controller — used by
 * the orb, the sidebar nav item, and anywhere else that should open the
 * Assistant without navigating away. Returns a safe no-op controller when
 * rendered without the provider (e.g. a component reused in an isolated
 * test) rather than throwing. */
export function useAssistantLayer(): AssistantLayerValue {
  const ctx = useContext(AssistantLayerContext);
  if (ctx) return ctx;
  return {
    uiState: "closed",
    open: () => {},
    minimize: () => {},
    restore: () => {},
    close: () => {},
  };
}

const PANEL_WIDTH = "440px";

/**
 * The global persistent Assistant layer: one `useAssistantConversation`
 * instance that survives navigation within the authenticated shell,
 * rendered as a desktop side panel or a mobile full-screen overlay
 * depending on viewport. Suppressed on `/app/assistant` itself — the full
 * page already shows the same UI, so the layer would just duplicate it on
 * screen. Opening/closing/minimizing never touches the conversation state
 * (no side effects, per the "não executar qualquer ação ao abrir/fechar"
 * rule) — it only toggles visibility. Nothing here survives a real page
 * refresh: that's intentional, not an oversight — the underlying thread is
 * still on the backend and reachable via "Histórico" from either surface,
 * but this session's in-memory draft/scroll state isn't real persistence
 * the backend offers, so it isn't invented here.
 */
export function AssistantLayerProvider({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  const pathname = usePathname();
  const [uiState, setUiState] = useState<UiState>("closed");
  // Once true, stays true — the instance stays "warm" after the first open
  // (closing/minimizing must never re-trigger a fetch or drop what's
  // loaded), but nothing fires before that first open.
  const [everOpened, setEverOpened] = useState(false);
  const lastFocusRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const conversation = useAssistantConversation({ enabled: everOpened });

  const greeting = useMemo(
    () => personalGreeting(me?.user.full_name, me?.organization.timezone),
    [me?.user.full_name, me?.organization.timezone],
  );

  const open = useCallback(
    (opts?: OpenOptions) => {
      if (typeof document !== "undefined") {
        lastFocusRef.current = document.activeElement as HTMLElement | null;
      }
      setEverOpened(true);
      if (opts) {
        conversation.applyEntryContext({
          prompt: opts.prompt,
          context: opts.context ?? undefined,
          returnTo: opts.returnTo ?? undefined,
        });
      }
      setUiState("open");
    },
    [conversation],
  );

  const minimize = useCallback(() => setUiState("minimized"), []);
  const restore = useCallback(() => setUiState("open"), []);
  const close = useCallback(() => {
    setUiState("closed");
    lastFocusRef.current?.focus?.();
  }, []);

  // The full page already renders the same experience — never show the
  // layer on top of it.
  const suppressedByRoute = pathname === "/app/assistant" || pathname?.startsWith("/app/assistant/");
  const visible = uiState === "open" && !suppressedByRoute;

  // Esc minimizes (not closes) — reversible by default, matches the
  // "conversa continua acessível" spirit. A submenu inside the layer
  // (threads/mic options) already handles its own Esc via the hook.
  useEffect(() => {
    if (!visible) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (conversation.threadsOpen || conversation.micMenuOpen) return;
      minimize();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [visible, conversation.threadsOpen, conversation.micMenuOpen, minimize]);

  // Mobile overlay: lock background scroll, and let the hardware/browser
  // back button minimize the layer instead of navigating away.
  useEffect(() => {
    if (!visible) return;
    const isMobile =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(max-width: 1023px)").matches;
    if (!isMobile) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.history.pushState({ assistantLayer: true }, "");
    function onPopState() {
      minimize();
    }
    window.addEventListener("popstate", onPopState);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("popstate", onPopState);
    };
  }, [visible, minimize]);

  // Focus trap + initial focus when the panel/overlay opens.
  useEffect(() => {
    if (!visible) return;
    const node = panelRef.current;
    if (!node) return;
    const focusable = node.querySelectorAll<HTMLElement>(
      'button, [href], textarea, input, [tabindex]:not([tabindex="-1"])',
    );
    focusable[0]?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab" || !node) return;
      const items = Array.from(
        node.querySelectorAll<HTMLElement>('button, [href], textarea, input, [tabindex]:not([tabindex="-1"])'),
      ).filter((el) => !el.hasAttribute("disabled"));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    node.addEventListener("keydown", onKeyDown);
    return () => node.removeEventListener("keydown", onKeyDown);
  }, [visible]);

  const value = useMemo<AssistantLayerValue>(
    () => ({ uiState, open, minimize, restore, close }),
    [uiState, open, minimize, restore, close],
  );

  return (
    <AssistantLayerContext.Provider value={value}>
      {children}

      {visible ? (
        <>
          {/* Desktop: fixed side panel, content reflows to make room —
              nothing is hidden behind it. */}
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="false"
            aria-label="Assistente Croniu"
            className="fixed inset-y-0 right-0 z-40 hidden border-l border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-lg)] lg:block"
            style={{ width: PANEL_WIDTH }}
          >
            <AssistantExperience
              layout="panel"
              conversation={conversation}
              greeting={greeting}
              onMinimize={minimize}
              onClose={close}
            />
          </div>

          {/* Mobile/tablet: near-fullscreen overlay, safe-area aware. */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Assistente Croniu"
            className="fixed inset-0 z-40 flex flex-col bg-[var(--color-surface)] pt-[env(safe-area-inset-top)] lg:hidden"
          >
            <AssistantExperience
              layout="overlay"
              conversation={conversation}
              greeting={greeting}
              onMinimize={minimize}
              onClose={close}
            />
          </div>
        </>
      ) : null}
    </AssistantLayerContext.Provider>
  );
}

/** Reserves room for the desktop panel so page content never sits behind
 * it — apply to the app shell's main content wrapper. The class name is a
 * literal (not built from `PANEL_WIDTH` via string interpolation) because
 * Tailwind's build-time scanner only picks up class names it can see
 * verbatim in source — an interpolated `lg:pr-[${PANEL_WIDTH}]` would never
 * get its CSS generated and the padding would silently never apply. Keep
 * this literal in sync with `PANEL_WIDTH` above by hand.
 *
 * The trailing `!` (Tailwind v4 important-modifier syntax) is load-bearing,
 * not decoration: `<main>` already carries `lg:px-6 xl:px-8` (symmetric
 * horizontal padding) at the same `lg:`/`xl:` breakpoints. Both utilities
 * set `padding-right`, and Tailwind resolves same-specificity conflicts by
 * the order it *generates* the utilities into the stylesheet — which has
 * no relationship to source order in a `className` string. Without `!`,
 * this class silently lost that fight in testing (computed padding-right
 * stayed at the base 24px instead of 440px) — real content sat behind the
 * panel despite the class being present in the DOM the whole time. */
export function useAssistantPanelSpacing(): string {
  const { uiState } = useAssistantLayer();
  return uiState === "open" ? "lg:pr-[440px]!" : "";
}
