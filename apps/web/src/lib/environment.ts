"use client";

import { useSyncExternalStore } from "react";

/**
 * True on HML (hostname starts with "croniu-hml") or in local dev
 * (`NODE_ENV === "development"`), false in PRD. `useSyncExternalStore` with
 * a server snapshot of `false` is the React-sanctioned way to read a
 * client-only value (hostname) without a hydration mismatch — the initial
 * paint never shows HML-only content, then updates once mounted.
 */
const noopSubscribe = () => () => {};

export function useIsHmlOrDevEnvironment(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => window.location.hostname.startsWith("croniu-hml") || process.env.NODE_ENV === "development",
    () => false,
  );
}

export function useIsHmlEnvironment(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => window.location.hostname.startsWith("croniu-hml"),
    () => false,
  );
}
