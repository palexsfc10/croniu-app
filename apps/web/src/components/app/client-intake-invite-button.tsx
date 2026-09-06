"use client";

import { useRef, useState } from "react";
import { apiFetch, type ClientIntakeLink } from "@/lib/api";
import { ActionSheet } from "@/components/ui/action-sheet";
import { Button } from "@/components/ui/button";
import { IconCheck, IconCopy, IconLink, IconWhatsApp } from "@/components/ui/icons";
import { copyTextToClipboard } from "@/lib/clipboard";

type InviteState = "idle" | "loading" | "ready" | "error";

type Props = {
  clientId: string;
  label?: string;
};

export function ClientIntakeInviteButton({ clientId, label = "Enviar cadastro" }: Props) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<InviteState>("idle");
  const [link, setLink] = useState<ClientIntakeLink | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);

  async function ensureLink() {
    if (inFlight.current) return inFlight.current;
    const task = (async () => {
      setState("loading");
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
    setCopied(false);
    setCopyError(null);
    void ensureLink();
  }

  function sendWhatsApp() {
    if (!link?.wa_message_url) {
      setState("error");
      return;
    }
    window.open(link.wa_message_url, "_blank", "noopener,noreferrer");
  }

  async function copyLink() {
    if (!link?.public_url) {
      setState("error");
      return;
    }
    // `copyTextToClipboard` never rejects in its real implementation
    // (every path resolves with `{ ok: false, ... }`), but a permission
    // prompt dismissed by the user or an unexpected browser quirk is
    // exactly the kind of thing worth not trusting blindly — never let a
    // rejected Promise here read as an unhandled crash instead of the
    // same "couldn't copy" feedback as an ordinary `ok: false`.
    let ok = false;
    try {
      ok = (await copyTextToClipboard(link.public_url)).ok;
    } catch {
      ok = false;
    }
    if (ok) {
      setCopied(true);
      setCopyError(null);
    } else {
      // Never silently declare success — an unavailable Clipboard API or
      // a rejected permission is exactly the case where the professional
      // most needs the link kept visible, so they can select/copy it by
      // hand instead of assuming it's already on their clipboard.
      setCopied(false);
      setCopyError("Não foi possível copiar o link. Selecione o endereço abaixo para copiar manualmente.");
    }
  }

  return (
    <>
      <Button
        variant="secondary"
        className="min-h-11 whitespace-nowrap"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={openSheet}
      >
        <IconLink className="mr-1.5 h-4 w-4" />
        {label}
      </Button>
      <ActionSheet
        open={open}
        onClose={() => setOpen(false)}
        labelledBy="client-invite-title"
        footer={
          state === "ready" && link ? (
            <div className="flex flex-col gap-2">
              {copyError ? (
                <div className="space-y-1.5">
                  <p role="alert" className="text-sm text-[var(--color-danger)]">
                    {copyError}
                  </p>
                  <input
                    readOnly
                    aria-label="Endereço do link de cadastro"
                    value={link.public_url}
                    onFocus={(e) => e.currentTarget.select()}
                    onClick={(e) => e.currentTarget.select()}
                    className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 font-mono text-sm text-[var(--color-ink-muted)]"
                  />
                </div>
              ) : null}
              <Button
                fullWidth
                variant="secondary"
                onClick={() => void copyLink()}
                className="inline-flex items-center justify-center gap-2"
              >
                {copied ? (
                  <IconCheck className="h-4 w-4" aria-hidden />
                ) : (
                  <IconCopy className="h-4 w-4" aria-hidden />
                )}
                {copied ? "Link copiado" : "Copiar link"}
              </Button>
              <Button
                fullWidth
                onClick={sendWhatsApp}
                className="inline-flex items-center justify-center gap-2"
              >
                <IconWhatsApp className="h-5 w-5" aria-hidden />
                Enviar pelo WhatsApp
              </Button>
            </div>
          ) : undefined
        }
      >
        <h2 id="client-invite-title" className="text-base font-semibold text-[var(--color-ink)]">
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
      </ActionSheet>
    </>
  );
}
