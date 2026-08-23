"use client";

import { useEffect, useRef, useState } from "react";
import {
  GOOGLE_CLIENT_ID,
  isGoogleAuthConfigured,
  loadGoogleIdentityScript,
} from "@/lib/google-auth";

type Props = {
  onCredential: (credential: string) => void | Promise<void>;
  onScriptError?: () => void;
  disabled?: boolean;
  text?: "signin_with" | "signup_with" | "continue_with";
};

/**
 * Renders Google's own branded button via Google Identity Services — using
 * their renderButton() instead of a custom button keeps us compliant with
 * Google's branding guidelines with zero extra design work, and getting the
 * built-in loading/hover/focus states for free.
 */
export function GoogleAuthButton({ onCredential, onScriptError, disabled, text = "continue_with" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isGoogleAuthConfigured) return;
    let cancelled = false;

    loadGoogleIdentityScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          ux_mode: "popup",
          callback: (response) => {
            if (busyRef.current || !response.credential) return;
            busyRef.current = true;
            void Promise.resolve(onCredential(response.credential)).finally(() => {
              busyRef.current = false;
            });
          },
        });
        window.google.accounts.id.renderButton(containerRef.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          shape: "pill",
          text,
          logo_alignment: "center",
          width: 336,
        });
        if (!cancelled) setReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
          onScriptError?.();
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  if (!isGoogleAuthConfigured || failed) return null;

  return (
    <div className="relative min-h-11 w-full">
      <div
        ref={containerRef}
        aria-busy={!ready}
        className={disabled ? "pointer-events-none opacity-60" : undefined}
      />
      {!ready ? (
        <div
          aria-hidden="true"
          className="absolute inset-0 flex min-h-11 items-center justify-center rounded-full border border-[var(--color-border)] text-sm text-[var(--color-ink-muted)]"
        >
          Carregando…
        </div>
      ) : null}
    </div>
  );
}
