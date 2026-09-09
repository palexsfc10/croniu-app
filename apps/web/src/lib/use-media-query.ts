import { useEffect, useState } from "react";

/**
 * Tracks whether `query` currently matches, updating live on resize.
 * Same idiom the assistant panel's own layout hook and Cliente 360°'s
 * "Editar" drawer decision already used independently — pulled into one
 * place instead of a third copy. SSR/first paint always reports `false`
 * (there's nothing to hydrate-mismatch against: this only matters after
 * mount, e.g. deciding whether a click opens a drawer or navigates).
 */
export function useMediaQuery(query: string): boolean {
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
