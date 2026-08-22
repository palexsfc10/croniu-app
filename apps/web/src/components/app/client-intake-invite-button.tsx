"use client";

import { useRef, useState } from "react";
import { apiFetch, type ClientIntakeLink } from "@/lib/api";
import { copyTextToClipboard } from "@/lib/clipboard";
import { Button } from "@/components/ui/button";
import { IconLink, IconWhatsApp } from "@/components/ui/icons";

type InviteState = "idle" | "loading" | "ready" | "error";

/** Extracts the exact message (greeting + link) already baked into the
 * WhatsApp share URL, so "copiar convite" and "enviar pelo WhatsApp"
 * always send identical text — same pattern as the generic org invite
 * in app/clients/page.tsx. */
function inviteMessageFrom(waMessageUrl: string | null | undefined): string | null {
  if (!waMessageUrl) return null;
  try {
    const text = new URL(waMessageUrl).searchParams.get("text");
    return text && text.trim() ? text : null;
  } catch {
    return null;
  }
}

type Props = {
  clientId: string;
  label?: string;
};

export function ClientIntakeInviteButton({ clientId, label = "Enviar cadastro" }: Props) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<InviteState>("idle");
  const [link, setLink] = useState<ClientIntakeLink | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const inFlight = useRef<Promise<void> | null>(null);

  async function ensureLink() {
    if (inFlight.current) return inFlight.current;
    const task = (async () => {
      setState("loading");
      setCopied(false);
      const res = await apiFetch<ClientIntakeLink>(`/api/v1/clients/${clientId}/intake-link`, {
        method: "POST",
        body: "{}",
      });
      if (res.error || !res.data?.public_url) {
        setState("error");
        return;
      }
      setLink(res.data);
      setState("ready");
    })();
    inFlight.current = task;
    try {
      await task;
    } finally {
      inFlight.current = null;
    }
  }

  function openSheet() {
    setOpen(true);
    setCopyError(false);
    void ensureLink();
  }

  async function copyInvite() {
    const message = inviteMessageFrom(link?.wa_message_url) ?? link?.public_url ?? null;
    if (!message) {
      setState("error");
      return;
    }
    const result = await copyTextToClipboard(message);
    setCopied(result.ok);
    setCopyError(!result.ok);
  }

  function sendWhatsApp() {
    if (!link?.wa_message_url) {
      setState("error");
      return;
    }
    window.open(link.wa_message_url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="relative min-w-0">
      <Button
        variant="secondary"
        className="min-h-11 whitespace-nowrap"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openSheet())}
      >
        <IconLink className="mr-1.5 h-4 w-4" />
        {label}
      </Button>
      {open ? (
        <div
          role="dialog"
          aria-label="Enviar convite de cadastro"
          className="absolute right-0 z-30 mt-1 w-[min(20rem,calc(100vw-2rem))] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-md"
        >
          <h2 className="text-sm font-semibold text-[var(--color-ink)]">
            Envie o formulário para este aluno completar o cadastro
          </h2>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            O aluno abre o link, revisa os dados que você já cadastrou e conclui a anamnese.
          </p>

          {state === "loading" ? (
            <p className="mt-3 text-sm text-[var(--color-ink-muted)]">Preparando convite…</p>
          ) : null}

          {state === "error" ? (
            <div className="mt-3 space-y-2">
              <p role="alert" className="text-sm text-[var(--color-danger)]">
                Não foi possível preparar o convite. Tente novamente.
              </p>
              <Button fullWidth variant="secondary" onClick={() => void ensureLink()}>
                Tentar novamente
              </Button>
            </div>
          ) : null}

          {state === "ready" && link ? (
            <div className="mt-3 flex flex-col gap-2">
              <Button
                fullWidth
                onClick={sendWhatsApp}
                className="inline-flex items-center justify-center gap-2"
              >
                <IconWhatsApp className="h-5 w-5" aria-hidden />
                Enviar pelo WhatsApp
              </Button>
              <Button fullWidth variant="secondary" onClick={() => void copyInvite()}>
                Copiar convite
              </Button>
              {copyError || copied ? (
                <p
                  role="status"
                  className={`text-center text-xs ${
                    copyError ? "text-[var(--color-danger)]" : "text-[var(--color-ink-muted)]"
                  }`}
                >
                  {copyError ? "Não foi possível copiar. Tente novamente." : "Convite copiado"}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
