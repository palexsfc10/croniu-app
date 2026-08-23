/**
 * Google Identity Services (GSI) loader — feature-flag boundary lives here:
 * the button/flow is present in the bundle either way, but stays inert
 * (renders nothing) whenever NEXT_PUBLIC_GOOGLE_CLIENT_ID is empty. Value is
 * inlined at build time (see apps/web/Dockerfile), same pattern as
 * NEXT_PUBLIC_API_URL.
 */
export const GOOGLE_CLIENT_ID = (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "").trim();
export const isGoogleAuthConfigured = GOOGLE_CLIENT_ID.length > 0;

const GSI_SCRIPT_SRC = "https://accounts.google.com/gsi/client";

type GoogleCredentialResponse = {
  credential?: string;
};

type GoogleAccountsId = {
  initialize: (config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    ux_mode?: "popup" | "redirect";
    itp_support?: boolean;
  }) => void;
  renderButton: (
    parent: HTMLElement,
    options: {
      type?: "standard" | "icon";
      theme?: "outline" | "filled_blue" | "filled_black";
      size?: "large" | "medium" | "small";
      shape?: "rectangular" | "pill" | "circle" | "square";
      text?: "signin_with" | "signup_with" | "continue_with" | "signin";
      logo_alignment?: "left" | "center";
      width?: number;
    },
  ) => void;
  cancel: () => void;
};

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}

let scriptLoadPromise: Promise<void> | null = null;

export function loadGoogleIdentityScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }
  if (window.google?.accounts?.id) {
    return Promise.resolve();
  }
  if (scriptLoadPromise) {
    return scriptLoadPromise;
  }
  scriptLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GSI_SCRIPT_SRC}"]`,
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("gsi_script_error")));
      return;
    }
    const script = document.createElement("script");
    script.src = GSI_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("gsi_script_error"));
    document.head.appendChild(script);
  });
  return scriptLoadPromise;
}

export type { GoogleAccountsId, GoogleCredentialResponse };
