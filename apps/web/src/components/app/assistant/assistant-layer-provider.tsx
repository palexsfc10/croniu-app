"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
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
  /** `uiState === "open"` AND not suppressed by route (i.e. actually
   * rendered on screen right now) — what layout code should check, since
   * `uiState` alone stays "open" even while suppressed on `/app/assistant`
   * itself (navigating there doesn't close the layer, just hides it). */
  visible: boolean;
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
    visible: false,
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
    () => ({ uiState, visible, open, minimize, restore, close }),
    [uiState, visible, open, minimize, restore, close],
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

// Reflow (reserving 472px of padding so content never sits behind the
// panel) only holds up on genuinely wide screens. Live testing on
// /app/clients — the densest desktop table in the product, 7 columns —
// found real content collisions (a "Atrasado" amount/badge spilling into
// the Renovação column) at 1024, 1280, 1440, 1536, 1680, and even 1800px
// with the panel open; 1920px was the first width confirmed clean. Below
// that, the panel still opens (same visual side-panel), but as a true
// overlay: content keeps its full width and the panel's opaque background
// covers whatever sits behind its 440px strip, rather than the workspace
// trying to compress an already-dense table further.
const DOCK_SAFE_QUERY = "(min-width: 1920px)";

/** Tracks whether `query` currently matches, updating live on resize —
 * inline styles (unlike Tailwind classes) can't express a media query on
 * their own, so this is how `useAssistantPanelSpacing` stays viewport-
 * conditional without one. */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(query);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount hydrate from matchMedia, same pattern used elsewhere for external-source hydration
    setMatches(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/** Reserves room for the desktop panel so page content never sits behind
 * it — spread the result onto the app shell's main content wrapper as
 * `style`. Only applied at `DOCK_SAFE_QUERY` and above (see its comment);
 * between `lg:` (1024px, where the panel itself starts showing) and that
 * safe width, the panel overlays instead — no padding is reserved. Not a
 * Tailwind class: `<main>` already carries `lg:px-6 xl:px-8` (symmetric
 * horizontal padding) at those same breakpoints, both setting
 * `padding-right` — Tailwind resolves same-specificity conflicts by the
 * order it *generates* utilities into the stylesheet, which has no
 * relationship to a class string's order or to the `!important` modifier
 * placement, and in testing the dynamic class silently lost that fight
 * (computed padding-right stayed at the base 24px instead of 440px) —
 * real content sat behind the panel despite the class being in the DOM
 * the whole time. An inline style always wins the cascade over any
 * class-based rule, so this sidesteps the collision entirely instead of
 * trying to out-specificity it. */
export function useAssistantPanelSpacing(): { style?: CSSProperties } {
  const { visible } = useAssistantLayer();
  const isDockSafe = useMediaQuery(DOCK_SAFE_QUERY);
  if (visible && isDockSafe) {
    // Panel width + the widest base gutter (`xl:px-8` = 32px) so content
    // never sits closer to the panel than it would to the viewport edge.
    return { style: { paddingRight: "calc(440px + 32px)" } };
  }
  return {};
}
